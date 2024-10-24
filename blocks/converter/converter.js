import { marked } from 'marked';  
import { decorateBlock, loadBlock } from '../../scripts/lib-franklin.js';  

  
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
async function fetchAndDecorate(url) {  
  try {  
    // Fetch and convert Markdown to HTML  
    const htmlString = await fetchMarkdown(url);  
  
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
const url = 'https://experienceleague.adobe.com/en/docs/analytics/analyze/admin-overview/analytics-overview.md';  
fetchAndDecorate(url);  