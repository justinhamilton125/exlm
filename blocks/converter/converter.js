import { marked } from 'marked';  
import { decorateBlock, loadBlock } from '../../scripts/lib-franklin.js';  
  
export default function decorate(block) {  
  // Function to fetch and convert Markdown content to HTML  
  async function fetchMarkdown(url) {  
    const response = await fetch(url);  
    if (!response.ok) {  
      throw new Error(`Failed to fetch Markdown from ${url}`);  
    }  
    const markdown = await response.text();  
    return marked(markdown); // Convert Markdown to HTML  
  }  
  
  // Function to fetch, convert, and decorate the content  
  async function fetchAndDecorate(url, targetBlock) {  
    try {  
      // Fetch and convert Markdown to HTML  
      const htmlString = await fetchMarkdown(url);  
      console.log('Fetched and converted HTML:', htmlString); // Debug log  
  
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
      console.error('Error fetching or decorating:', error);  
    }  
  }  
  
  // Function to extract URL from the block and call fetchAndDecorate  
  function extractAndDecorate() {  
    const markdownLinkElement = block.querySelector('a'); // Look for an <a> tag in the block  
    if (markdownLinkElement) {  
      const markdownLink = markdownLinkElement.href; // Extract the markdown link  
      fetchAndDecorate(markdownLink, block); // Pass the markdown link and the block to fetchAndDecorate  
    } else {  
      console.error("Markdown URL not found in the block.");  
    }  
  }  
  
  // Call the function to extract the markdown link and decorate the block  
  extractAndDecorate();  
}  