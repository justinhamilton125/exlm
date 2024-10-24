import { decorateBlock, loadBlock } from '../../scripts/lib-franklin.js';  
  
async function fetchAndDecorate(url) {  
  try {  
    const response = await fetch(url);  
    const htmlString = await response.text();  
  
    // Create a new DOM parser to parse the fetched HTML string  
    const parser = new DOMParser();  
    const doc = parser.parseFromString(htmlString, 'text/html');  
  
    // Assuming the blocks you want to decorate have a specific class, e.g., 'block-to-decorate'  
    const blocks = doc.querySelectorAll('.block-to-decorate');  
  
    blocks.forEach((block) => {  
      decorateBlock(block); // Decorate the block  
      loadBlock(block);     // Load the block  
    });  
  
    // Append the decorated blocks to the body or any specific element  
    document.body.append(...blocks);  
  } catch (error) {  
    // Replace console.error with a custom logging function if needed  
    console.error('Error fetching or decorating:', error);  
  }  
}  
  
// Example usage  
const url = 'https://example.com/page-to-fetch.html';  
fetchAndDecorate(url);  