import { createTag, fetchLanguagePlaceholders, getConfig, htmlToElement } from '../../scripts/scripts.js';
import BrowseCardsDelegate from '../../scripts/browse-card/browse-cards-delegate.js';
import { COVEO_SORT_OPTIONS } from '../../scripts/browse-card/browse-cards-constants.js';
import { buildCard, buildNoResultsContent } from '../../scripts/browse-card/browse-card.js';
import {
  convertToTitleCase,
  extractCapability,
  removeProductDuplicates,
} from '../../scripts/browse-card/browse-card-utils.js';
import { defaultProfileClient } from '../../scripts/auth/profile.js';
import getEmitter from '../../scripts/events.js';
import BuildPlaceholder from '../../scripts/browse-card/browse-card-placeholder.js';
import ResponsiveList from '../../scripts/responsive-list/responsive-list.js';
import defaultAdobeTargetClient from '../../scripts/adobe-target/adobe-target.js';
import BrowseCardsTargetDataAdapter from '../../scripts/browse-card/browse-card-target-data-adapter.js';

let placeholders = {};
try {
  placeholders = await fetchLanguagePlaceholders();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Error fetching placeholders:', err);
}

const ALL_ADOBE_OPTIONS_KEY = placeholders?.allAdobeProducts || 'All Adobe Products';
const DEFAULT_NUM_CARDS = 4;
const UEAuthorMode = window.hlx.aemRoot || window.location.href.includes('.html');

// Event for target data change (Updating the block based on target data)
const targetEventEmitter = getEmitter('loadTargetBlocks');

// Create array of numbers from 1 to n
const countNumberAsArray = (n) => Array.from({ length: n }, (_, i) => n - i);

/**
 * Generates HTML for loading shimmer animation with customizable sizes and an optional CSS class
 * @param {Array} shimmerSizes - An array of arrays, where each inner array
 *  contains width (percentage) and height (pixels) for individual shimmer divs.
 * @returns {string} - A string of HTML containing the shimmer divs with inline styles for width and height.
 */
function generateLoadingShimmer(shimmerSizes = [[100, 30]]) {
  return shimmerSizes
    .map(
      ([width, height]) =>
        `<div class="loading-shimmer" style="--placeholder-width: ${width}%; --placeholder-height: ${height}px"></div>`,
    )
    .join('');
}

/**
 * Update the copy from the target
 * @param {Object} data
 * @param {HTMLElement} heading
 * @param {HTMLElement} subheading
 * @param {HTMLElement} taglineCta
 * @param {HTMLElement} taglineText
 * @returns {void}
 */
export function updateCopyFromTarget(data, heading, subheading, taglineCta, taglineText) {
  if (data?.meta?.heading && heading) heading.innerHTML = data.meta.heading;
  else heading?.remove();
  if (data?.meta?.subheading && subheading) subheading.innerHTML = data.meta.subheading;
  else subheading?.remove();
  if (
    taglineCta &&
    data?.meta['tagline-cta-text'] &&
    data?.meta['tagline-cta-url'] &&
    data.meta['tagline-cta-text'].trim() !== '' &&
    data.meta['tagline-cta-url'].trim() !== ''
  ) {
    taglineCta.innerHTML = `
        <a href="${data.meta['tagline-cta-url']}" title="${data.meta['tagline-cta-text']}">
          ${data.meta['tagline-cta-text']}
        </a>
      `;
  } else {
    taglineCta?.remove();
  }
  if (taglineText && data?.meta['tagline-text'] && data?.meta['tagline-text'].trim() !== '') {
    taglineText.innerHTML = data.meta['tagline-text'];
  } else {
    taglineText?.remove();
  }
  if (!document.contains(taglineCta) && !document.contains(taglineText)) {
    const taglineParentBlock = document.querySelector('.recommended-content-result-text');
    if (taglineParentBlock) {
      taglineParentBlock?.remove();
    }
  }
}

/**
 * Sets target data as a data attribute on the given block element.
 *
 * This function checks if the provided `data` object contains a `meta` property.
 * If the `meta` property exists, it serializes the metadata as a JSON string and
 * adds it to the specified block element as a custom data attribute `data-analytics-target-meta`.
 *
 * @param {Object} data - The data returned from target.
 * @param {HTMLElement} block - The DOM element to which the meta data will be added as an attribute.
 *
 */
export function setTargetDataAsBlockAttribute(data, block) {
  if (data?.meta) {
    block.setAttribute('data-analytics-target-meta', JSON.stringify(data?.meta));
  }
}

/**
 * Adds a data-analytics-coveo-meta attribute to each recommended-content block on the page.
 * Value is in the format coveo-X, where X represents the order of the block on the page.
 */
function setCoveoCountAsBlockAttribute() {
  const recommendedBlocks = document.querySelectorAll('.recommended-content.block');
  let coveoCount = 1;

  recommendedBlocks.forEach((block) => {
    block.setAttribute('data-analytics-coveo-meta', `coveo-${coveoCount}`);
    coveoCount += 1;
  });
}

// fetch list of all interests
async function fetchInterestData() {
  try {
    let data;
    const { interestsUrl } = getConfig();
    const response = await fetch(interestsUrl, {
      method: 'GET',
    });
    if (response.ok) {
      data = await response.json();
    }
    return data?.data || [];
  } catch (error) {
    /* eslint-disable no-console */
    console.error('Error fetching data', error);
    return [];
  }
}
const interestDataPromise = fetchInterestData();

// Create a query string for coveo to exclude the card ids
const prepareExclusionQuery = (cardIdsToExclude) => {
  // eslint-disable-next-line no-useless-escape
  const query = cardIdsToExclude.map((id) => `(@el_id NOT \"${id}\")`).join(' AND ');
  return cardIdsToExclude.length <= 1 ? query : `(${query})`;
};

// Find the interests that are not present in the target data
async function findEmptyFilters(targetCriteriaId, profileInterests = []) {
  const resp = await defaultAdobeTargetClient.getTargetData(targetCriteriaId);
  const data = resp?.data || [];

  return profileInterests.filter((interest) => !data.some(({ product }) => product.split(',').includes(interest)));
}

// Build a placeholder for the card
const renderCardPlaceholders = (contentDiv, renderCardsFlag = true) => {
  const cardDiv = document.createElement('div');
  cardDiv.classList.add('card-wrapper');
  if (renderCardsFlag) {
    contentDiv.appendChild(cardDiv);
  }

  const cardPlaceholder = new BuildPlaceholder(1);
  cardPlaceholder.add(cardDiv);
  return {
    shimmer: cardPlaceholder,
    wrapper: cardDiv,
  };
};

/**
 * Decorate function to process and log the mapped data.
 * @param {HTMLElement} block - The block of data to process.
 */
export default async function decorate(block) {
  // Extracting elements from the block
  const htmlElementData = [...block.children].map((row) => row.firstElementChild);
  const [headingElement, descriptionElement, filterSectionElement, ...remainingElements] = htmlElementData;
  const recommendedContentShimmer = `
  <div class="recommended-content-header">${generateLoadingShimmer([[50, 14]])}</div>
  <div class="recommended-content-description">${generateLoadingShimmer([[50, 10]])}</div>
`;
  // Clearing the block's content and adding CSS class
  block.innerHTML = '';

  filterSectionElement.classList.add('recommended-content-filter-heading');
  const blockHeader = createTag('div', { class: 'recommended-content-block-header' });
  blockHeader.innerHTML = generateLoadingShimmer([[80, 30]]);
  block.insertAdjacentHTML('afterbegin', recommendedContentShimmer);
  block.appendChild(filterSectionElement);
  block.appendChild(blockHeader);

  const headerContainer = block.querySelector('.recommended-content-header');
  const descriptionContainer = block.querySelector('.recommended-content-description');
  const reversedDomElements = remainingElements.reverse();
  const [linkEl, resultTextEl, sortEl, roleEl, solutionEl, filterProductByOptionEl, ...contentTypesEl] =
    reversedDomElements;
  const targetCriteriaId = block.dataset.targetScope;
  const profileDataPromise = defaultProfileClient.getMergedProfile();

  const tempWrapper = htmlToElement(`
      <div class="recommended-content-temp-wrapper">
        <div class="browse-cards-block-content recommended-content-block-section recommended-content-shimmer-wrapper"></div>
      </div>
    `);
  const tempContentSection = tempWrapper.querySelector('.recommended-content-block-section');
  countNumberAsArray(4).forEach(() => {
    const { shimmer: shimmerInstance, wrapper } = renderCardPlaceholders(tempWrapper);
    wrapper.appendChild(shimmerInstance.shimmer);
    tempContentSection.appendChild(wrapper);
  });

  block.appendChild(tempWrapper);

  const defaultOptionsKey = [];
  let contentTypesFetchMap = {};
  const cardIdsToExclude = [];
  const allMyProductsCardModels = [];
  const dataConfiguration = {};

  const getCardsData = (payload) =>
    new Promise((resolve) => {
      BrowseCardsDelegate.fetchCardData(payload)
        .then((data) => {
          const [ct] = payload.contentType || [''];
          resolve({
            contentType: ct,
            data,
          });
        })
        .catch(() => {
          resolve({});
        });
    });

  const renderCardsBlock = (cardModels, payloadConfig, contentDiv) => {
    const { renderCards = true, lowercaseOptionType } = payloadConfig;
    const promises = cardModels.map(
      (cardData, i) =>
        new Promise((resolve) => {
          const cardDiv = payloadConfig.wrappers[i];
          const alreadyRenderedCardIds = dataConfiguration[lowercaseOptionType]?.renderedCardIds || [];
          if (cardData?.cardPromise) {
            cardData.cardPromise.then((cardDataResponse) => {
              const { cardsToRenderCount } = cardData;
              const { data: delayedCardData = [] } = cardDataResponse;
              const cardModelsList = [];
              if (delayedCardData.length === 0) {
                if (renderCards) {
                  cardData.shimmers?.forEach((shimmerEl, index) => {
                    shimmerEl.remove();
                    cardData.wrappers[index].style.display = 'none';
                  });
                }
              } else {
                countNumberAsArray(cardsToRenderCount).forEach((_, index) => {
                  const shimmer = cardData.shimmers[index];
                  const wrapperDiv = cardData.wrappers[index];
                  if (renderCards) {
                    if (shimmer) {
                      shimmer.remove();
                    }
                    wrapperDiv.innerHTML = '';
                  }
                  const [defaultCardModel] = delayedCardData;
                  const targetIndex = delayedCardData.findIndex((delayData) =>
                    delayData.id ? !alreadyRenderedCardIds.includes(delayData.id) : false,
                  );
                  let cardModel;
                  if (targetIndex !== -1) {
                    cardModel = delayedCardData[targetIndex];
                    delayedCardData.splice(targetIndex, 1);
                  } else {
                    cardModel = defaultCardModel;
                    delayedCardData.splice(0, 1);
                  }
                  if (renderCards) {
                    if (cardModel.id) {
                      dataConfiguration[lowercaseOptionType].renderedCardIds.push(cardModel.id);
                    }
                    buildCard(contentDiv, wrapperDiv, cardModel);
                  }
                  cardModelsList.push(cardModel);
                });
              }
              resolve(cardModelsList);
            });
          } else {
            if (renderCards) {
              cardDiv.innerHTML = '';
              if (cardData.id) {
                dataConfiguration[lowercaseOptionType].renderedCardIds.push(cardData.id);
              }
              buildCard(contentDiv, cardDiv, cardData);
            }
            resolve([cardData]);
          }
        }),
    );
    return promises;
  };

  const recommendedContentNoResults = () => {
    const recommendedContentNoResultsElement = block.querySelector('.browse-card-no-results');
    const noResultsText =
      placeholders?.recommendedContentNoResultsText ||
      `We couldn’t find specific matches, but here are the latest tutorials/articles that others are loving right now!`;
    recommendedContentNoResultsElement.innerHTML = noResultsText;
  };

  const renderCardBlock = (parentDiv) => {
    if (block.contains(tempWrapper)) {
      block.removeChild(tempWrapper);
    }
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('browse-cards-block-content', 'recommended-content-block-section');
    parentDiv.appendChild(contentDiv);
    resultTextEl.classList.add('recommended-content-discover-resource');
    linkEl.classList.add('recommended-content-result-link');
    if (linkEl.innerHTML || resultTextEl.innerHTML) {
      const seeMoreEl = document.createElement('div');
      seeMoreEl.classList.add('recommended-content-result-text');
      seeMoreEl.appendChild(resultTextEl);
      seeMoreEl.appendChild(linkEl);
      parentDiv.appendChild(seeMoreEl);
    }
  };

  const getListOfFilterOptions = async (targetSupport, profileInterests, targetCriteriaScopeId) => {
    const sortedProfileInterests = profileInterests.sort();
    let filterOptions = [...new Set(sortedProfileInterests)];
    filterOptions.unshift(...defaultOptionsKey);
    if (targetSupport) {
      const emptyFilters = await findEmptyFilters(targetCriteriaScopeId, profileInterests);
      filterOptions = filterOptions.filter((ele) => !emptyFilters.includes(ele));
    }
    return filterOptions;
  };

  const resetContentDiv = (contentDiv) => {
    contentDiv.innerHTML = '';
    contentDiv.style.display = '';
    const noResultsContent = block.querySelector('.browse-card-no-results');
    if (noResultsContent) {
      noResultsContent.remove();
    }
  };

  async function renderBlock({ targetSupport, targetCriteriaScopeId }) {
    Promise.all([profileDataPromise, interestDataPromise]).then(async (promiseResponses) => {
      const [profileData, interestsDataArray] = promiseResponses;
      const {
        role: profileRoles = [],
        interests: profileInterests = [],
        solutionLevels: profileSolutionLevels = [],
      } = profileData || {};

      if (profileInterests.length === 0) {
        if (!UEAuthorMode) filterSectionElement.style.display = 'none';
        if (!UEAuthorMode) blockHeader.style.display = 'none';
        defaultOptionsKey.push(ALL_ADOBE_OPTIONS_KEY);
      } else if (profileInterests.length === 1) {
        if (!UEAuthorMode) filterSectionElement.style.display = 'none';
        defaultOptionsKey.push(ALL_ADOBE_OPTIONS_KEY);
      } else {
        defaultOptionsKey.push(ALL_ADOBE_OPTIONS_KEY);
      }

      if (!(targetSupport && targetCriteriaScopeId)) {
        headerContainer.innerHTML = headingElement.innerText;
        descriptionContainer.innerHTML = descriptionElement.innerText;
        setCoveoCountAsBlockAttribute();
        block.style.display = 'block';
      }

      const sortByContent = sortEl?.innerText?.trim();
      const contentTypes = contentTypesEl?.map((contentTypeEL) => contentTypeEL?.innerText?.trim()).reverse() || [];
      const contentTypeIsEmpty = contentTypes?.length === 0;
      const numberOfResults = contentTypeIsEmpty ? DEFAULT_NUM_CARDS : 1;

      contentTypesFetchMap = contentTypeIsEmpty
        ? { '': DEFAULT_NUM_CARDS }
        : contentTypes.reduce((acc, curr) => {
            if (!acc[curr]) {
              acc[curr] = 1;
            } else {
              acc[curr] += 1;
            }
            return acc;
          }, {});

      const encodedSolutionsText = solutionEl.innerText?.trim() ?? '';
      const { products, versions, features } = extractCapability(encodedSolutionsText);
      const sortedProfileInterests = profileInterests.sort();
      const experienceLevels = sortedProfileInterests.map((interestName) => {
        const interest = (interestsDataArray || []).find((int) => int.Name === interestName);
        let expLevel = 'Beginner';
        if (interest) {
          const solution = profileSolutionLevels.find((sol) => sol.includes(interest.id)) || '';
          const [, level] = solution.split(':');
          if (level) {
            expLevel = level;
          }
        }
        return expLevel;
      });
      const sortCriteria = COVEO_SORT_OPTIONS[sortByContent?.toUpperCase() ?? 'MOST_POPULAR'];
      const filterProductByOption = filterProductByOptionEl?.innerText?.trim() ?? '';
      const role = roleEl?.innerText?.trim()?.includes('profile_context')
        ? profileRoles
        : roleEl?.innerText?.trim().split(',').filter(Boolean);

      const filterOptions = await getListOfFilterOptions(targetSupport, profileInterests, targetCriteriaScopeId);
      if (filterOptions.length <= 1 && !UEAuthorMode) {
        filterSectionElement.style.display = 'none';
      }
      const [defaultFilterOption = ''] = filterOptions;
      const containsAllAdobeProductsTab = filterOptions.includes(ALL_ADOBE_OPTIONS_KEY);

      async function parseCardResponseData(cardResponse, apiConfigObject) {
        let data = [];
        if (targetSupport) {
          data = cardResponse?.data ?? [];
          const { shimmers, params, optionType } = apiConfigObject;
          shimmers.forEach((shimmer) => {
            shimmer.remove();
          });
          if (optionType.toLowerCase() !== defaultOptionsKey[0].toLowerCase()) {
            if (defaultOptionsKey.length > 1 && optionType.toLowerCase() === defaultOptionsKey[1].toLowerCase()) {
              if (cardResponse?.allMyProducts) {
                data = cardResponse.allMyProducts;
              } else {
                data = data.filter((pageData) =>
                  params.context.interests.some((ele) => pageData.product.toLowerCase().includes(ele.toLowerCase())),
                );
                cardResponse.allMyProducts = Array.from(data).sort(() => Math.random() - 0.5);
              }
            } else {
              data = data.filter((pageData) => pageData.product.toLowerCase().includes(optionType.toLowerCase()));
            }
          }
          if (optionType.toLowerCase() === defaultOptionsKey[0].toLowerCase()) {
            if (cardResponse?.allAdobeProducts) {
              data = cardResponse.allAdobeProducts;
            } else {
              cardResponse.allAdobeProducts = Array.from(data).sort(() => Math.random() - 0.5);
              data = cardResponse.allAdobeProducts;
            }
          }
          data = await BrowseCardsTargetDataAdapter.mapResultsToCardsData(data.slice(0, 4));
        } else {
          const { data: cards = [], contentType: ctType } = cardResponse || {};
          const { shimmers: cardShimmers, payload: apiPayload, wrappers: cardWrappers } = apiConfigObject;
          const { noOfResults } = apiPayload;
          if (cards.length) {
            countNumberAsArray(noOfResults).forEach(() => {
              const model = cards.shift();
              if (model) {
                data.push(model);
              }
              const cardShimmer = cardShimmers.shift();
              if (cardShimmer) {
                cardShimmer.remove();
              }
            });
          } else {
            // Remove contentType and make new call.
            const payloadInfo = {
              ...apiPayload,
              contentType: null,
              noOfResults: 4,
            };
            data.push({
              cardPromise: getCardsData(payloadInfo),
              shimmers: cardShimmers,
              contentType: ctType,
              wrappers: cardWrappers,
              cardsToRenderCount: noOfResults,
            });
          }
        }
        return data;
      }

      const fetchDataAndRenderBlock = async (optionType, renderCards = true) => {
        const contentDiv = block.querySelector('.recommended-content-block-section');
        const lowercaseOptionType = optionType?.toLowerCase();
        const saveCardResponse =
          [ALL_ADOBE_OPTIONS_KEY.toLowerCase()].includes(lowercaseOptionType) && cardIdsToExclude.length === 0;
        if (!dataConfiguration[lowercaseOptionType]) {
          dataConfiguration[lowercaseOptionType] = {};
        }
        dataConfiguration[lowercaseOptionType].renderedCardIds = [];
        contentDiv.dataset.selected = lowercaseOptionType;
        contentDiv.setAttribute('data-analytics-filter-id', lowercaseOptionType);
        const showDefaultOptions = defaultOptionsKey.some((key) => lowercaseOptionType === key.toLowerCase());
        const interest = filterOptions.find((opt) => opt.toLowerCase() === lowercaseOptionType);
        const expLevelIndex = sortedProfileInterests.findIndex((s) => s === interest);
        const expLevel = experienceLevels[expLevelIndex] ?? 'Beginner';
        let clonedProducts = showDefaultOptions ? structuredClone(removeProductDuplicates(products)) : [interest];
        if (showDefaultOptions) {
          switch (filterProductByOption) {
            case 'profile_context':
              clonedProducts = [...new Set(sortedProfileInterests)];
              break;
            case 'specific_products':
              clonedProducts = products?.length ? [...products] : [];
              break;
            default:
              clonedProducts = [];
              break;
          }
        }

        const params = {
          contentType: null,
          product: clonedProducts,
          feature: features.length ? [...new Set(features)] : null,
          version: versions.length ? [...new Set(versions)] : null,
          role: role?.length ? role : profileRoles,
          sortCriteria,
          noOfResults: numberOfResults,
          aq: !showDefaultOptions && cardIdsToExclude.length ? prepareExclusionQuery(cardIdsToExclude) : undefined,
          context: showDefaultOptions ? {} : { interests: [interest], experience: [expLevel], role: profileRoles },
        };

        if (renderCards) {
          resetContentDiv(contentDiv);
        }

        const prepareTargetBlockCardPromise = () => {
          const targetPromises = [];
          const cardShimmers = [];
          const wrappers = [];
          countNumberAsArray(DEFAULT_NUM_CARDS).forEach(() => {
            const { shimmer, wrapper } = renderCardPlaceholders(contentDiv, renderCards);
            cardShimmers.push(shimmer);
            wrappers.push(wrapper);
          });
          const payloadConfig = {
            targetSupport: true,
            shimmers: cardShimmers,
            wrappers,
            params,
            optionType,
            renderCards,
            lowercaseOptionType,
          };
          targetPromises.push(
            new Promise((resolve) => {
              defaultAdobeTargetClient
                .getTargetData(targetCriteriaScopeId)
                .then(async (resp) => {
                  if (!resp) {
                    if (!UEAuthorMode) {
                      const section = block.closest('.section');
                      block.parentElement.remove();
                      if (section?.children?.length === 0) section.remove();
                    }
                  }
                  if (resp?.data) {
                    updateCopyFromTarget(resp, headerContainer, descriptionContainer, linkEl, resultTextEl);
                    block.style.display = 'block';
                    setTargetDataAsBlockAttribute(resp, block);
                  }
                  const cardModels = await parseCardResponseData(resp, payloadConfig);
                  let renderedCardModels = [];
                  if (cardModels?.length) {
                    const targetCardRenderPromises = renderCardsBlock(cardModels, payloadConfig, contentDiv);
                    renderedCardModels = await Promise.all(targetCardRenderPromises);
                  }
                  resolve({
                    data: cardModels,
                    payloadConfig,
                    renderedCardModels,
                  });
                })
                .catch(() => {
                  resolve({ data: [], renderedCardModels: [] });
                });
            }),
          );
          return targetPromises;
        };
        const prepareV2CardPromise = () =>
          Object.keys(contentTypesFetchMap).map((contentType) => {
            const payload = {
              ...params,
            };
            if (contentType) {
              payload.contentType = [contentType];
            }
            if (contentTypesFetchMap[contentType]) {
              payload.noOfResults = contentTypesFetchMap[contentType];
            }
            const { noOfResults } = payload;
            const cardShimmers = [];
            const wrappers = [];
            countNumberAsArray(noOfResults).forEach(() => {
              const { shimmer, wrapper } = renderCardPlaceholders(contentDiv, renderCards);
              cardShimmers.push(shimmer);
              wrappers.push(wrapper);
            });
            const [payloadContentType] = payload.contentType || [''];
            const payloadConfig = {
              payload,
              shimmers: cardShimmers,
              contentType: payloadContentType,
              wrappers,
              renderCards,
              lowercaseOptionType,
            };
            return new Promise((resolve) => {
              getCardsData(payload).then(async (resp) => {
                const cardModels = await parseCardResponseData(resp, payloadConfig);
                let renderedCardModels = [];
                if (cardModels?.length) {
                  const renderPromises = renderCardsBlock(cardModels, payloadConfig, contentDiv);
                  renderedCardModels = await Promise.all(renderPromises);
                }
                resolve({
                  data: cardModels,
                  payloadConfig,
                  renderedCardModels,
                });
              });
            });
          });

        const cardPromises = targetSupport ? prepareTargetBlockCardPromise() : prepareV2CardPromise();

        block
          .querySelector('.recommended-content-block-section')
          ?.setAttribute('data-analytics-rec-source', targetSupport ? 'target' : 'coveo');

        Promise.all(cardPromises)
          .then((finalPromiseResponse) => {
            const dontRenderCards = finalPromiseResponse.some((data) => data?.payloadConfig?.renderCards === false);
            if (saveCardResponse) {
              const renderedModels = finalPromiseResponse.reduce((acc, curr) => {
                curr.renderedCardModels?.flat()?.forEach((d) => acc.push(d));
                return acc;
              }, allMyProductsCardModels);

              renderedModels.forEach((model) => {
                if (model?.id) {
                  cardIdsToExclude.push(model.id);
                }
              });
            }
            if (dontRenderCards) {
              return;
            }
            const cardsCount = contentDiv.querySelectorAll('.browse-card').length;
            if (cardsCount === 0) {
              Array.from(contentDiv.querySelectorAll('.shimmer-placeholder')).forEach((shimmer) => {
                shimmer.remove();
              });
              buildNoResultsContent(contentDiv, false);
              buildNoResultsContent(contentDiv, true);
              recommendedContentNoResults(contentDiv);
              return;
            }

            const navSectionEl = block.querySelector('.recommended-content-nav-section');
            if (navSectionEl) {
              const classOp =
                contentDiv?.scrollWidth && contentDiv.scrollWidth <= contentDiv.offsetWidth ? 'add' : 'remove';
              navSectionEl.classList[classOp]('recommended-content-hidden');
            }
          })
          .catch((err) => {
            const cardsBlockCount = contentDiv.querySelectorAll('.browse-card').length;
            if (cardsBlockCount === 0) {
              buildNoResultsContent(contentDiv, true);
              recommendedContentNoResults(contentDiv);
            } else {
              // In the unlikely scenario that some card promises were successfully resolved, while some others failed. Try to show the rendered cards.
              Array.from(contentDiv.querySelectorAll('.shimmer-placeholder')).forEach((element) => {
                element.remove();
              });
            }
            /* eslint-disable-next-line no-console */
            console.error(err);
          });
      };

      /* Responsive List View */
      const listItems = filterOptions.map((item) => {
        const value = item ? convertToTitleCase(item) : '';
        return {
          value,
          title: value,
        };
      });

      const defaultOption = defaultFilterOption ? convertToTitleCase(defaultFilterOption) : null;

      // eslint-disable-next-line no-new
      new ResponsiveList({
        wrapper: blockHeader,
        items: listItems,
        defaultSelected: defaultOption,
        onInitCallback: () => {
          /* Reused the existing method */
          renderCardBlock(block);
          fetchDataAndRenderBlock(defaultOption);
          if (containsAllAdobeProductsTab && defaultOption !== ALL_ADOBE_OPTIONS_KEY) {
            setTimeout(() => {
              fetchDataAndRenderBlock(ALL_ADOBE_OPTIONS_KEY, false); // pre-fetch all my tab cards to avoid duplicates in indvidual tab. Timeout helps with 429 status code of v2 calls.
            }, 500);
          }
        },
        onSelectCallback: (selectedItem) => {
          /* Reused the existing method */
          if (selectedItem) {
            fetchDataAndRenderBlock(selectedItem);
          }
        },
      });
    });
  }

  targetEventEmitter.on('dataChange', async (data) => {
    const blockId = block.id;
    const { blockId: targetBlockId, scope } = data.value;
    if (targetBlockId === blockId) {
      renderBlock({ targetSupport: true, targetCriteriaScopeId: scope });
    }
  });

  defaultAdobeTargetClient.checkTargetSupport().then(async (targetSupport) => {
    if (targetCriteriaId || !targetSupport) {
      renderBlock({ targetSupport, targetCriteriaScopeId: targetCriteriaId });
    }
  });
}
