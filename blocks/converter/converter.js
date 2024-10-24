import { decorateBlock, loadBlock } from '../../scripts/lib-franklin.js';  
  
export default function decorate(block) {  
  // Function to fetch HTML content from the EXL Converter URL  
  async function fetchHTMLContent(url) {  
    const response = await fetch(url);  
    if (!response.ok) {  
      throw new Error(`Failed to fetch content from ${url}`);  
    }  
    return response.text(); // Get the response body as text (HTML)  
  }  
  
  // Function to fetch, convert, and redecorate the content  
  async function fetchAndRedecorate(url, targetBlock) {  
    try {  
      // Fetch the HTML content  
      const htmlString = await fetchHTMLContent(url);  
      console.log('Fetched HTML content:', htmlString); // Debug log  
  
      // Create a new DOM parser to parse the fetched HTML string  
      const parser = new DOMParser();  
      const doc = parser.parseFromString(htmlString, 'text/html');  
  
      // Assuming the blocks you want to decorate have a specific class, e.g., 'block-to-decorate'  
      const blocks = doc.querySelectorAll('.block-to-decorate');  
  
      if (blocks.length === 0) {  
        console.warn('No blocks found with the class .block-to-decorate');  
      }  
  
      blocks.forEach((decoratedBlock) => {  
        decorateBlock(decoratedBlock); // Decorate the block  
        loadBlock(decoratedBlock);     // Load the block  
      });  
  
      // Append the decorated blocks to the target block  
      targetBlock.append(...blocks);  
    } catch (error) {  
      // Replace console.error with a custom logging function if needed  
      console.error('Error fetching or redecorating:', error);  
    }  
  }  
  
  // Function to extract URL from the block and call fetchAndRedecorate  
  function extractAndRedecorate() {  
    const converterLinkElement = block.querySelector('a'); // Look for an <a> tag in the block  
    if (converterLinkElement) {  
      const converterLink = converterLinkElement.href; // Extract the converter link  
      fetchAndRedecorate(converterLink, block); // Pass the converter link and the block to fetchAndRedecorate  
    } else {  
      console.error("Converter URL not found in the block.");  
    }  
  }  
  
  // Call the function to extract the converter link and redecorate the block  
  extractAndRedecorate();  
}  