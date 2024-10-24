import { marked } from 'marked';    
import { decorateBlock, loadBlock } from '../../scripts/lib-franklin.js';      
  
export default function decorate(block) {      
  // Function to fetch and convert Markdown content to HTML      
  async function fetchMarkdown(url) {        
    try {  
      const response = await fetch(url);        
      if (!response.ok) {          
        throw new Error(`Failed to fetch Markdown from ${url}`);        
      }        
      const markdown = await response.text();        
      return marked(markdown); // Convert Markdown to HTML      
    } catch (error) {  
      console.error('Error fetching Markdown:', error);  
      throw error;  
    }  
  }        
  
  // Function to fetch, convert, and decorate the content      
  async function fetchAndRedecorate(url, targetBlock) {        
    try {          
      // Fetch and convert Markdown to HTML          
      const htmlString = await fetchMarkdown(url);          
      console.log('Fetched and converted HTML:', htmlString); // Debug log            
  
      // Create a new DOM parser to parse the fetched HTML string          
      const parser = new DOMParser();          
      const doc = parser.parseFromString(htmlString, 'text/html');            
  
      // Assuming the blocks you want to decorate have a specific class, e.g., 'block-to-decorate'          
      const blocks = doc.body.children; // Use all top-level children            
  
      if (blocks.length === 0) {            
        console.warn('No content found in the fetched HTML');          
      }            
  
      // Clear the target block before appending new content          
      targetBlock.innerHTML = '';            
  
      Array.from(blocks).forEach((decoratedBlock) => {            
        decorateBlock(decoratedBlock); // Decorate the block            
        loadBlock(decoratedBlock);     // Load the block            
        targetBlock.appendChild(decoratedBlock); // Append the decorated block          
      });        
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
      const contentDiv = block.querySelector('.content'); // Target the content div  
      fetchAndRedecorate(converterLink, contentDiv); // Pass the converter link and the content div to fetchAndRedecorate  
    } else {          
      console.error("Converter URL not found in the block.");        
    }      
  }        
  
  // Call the function to extract the converter link and redecorate the block      
  extractAndRedecorate();    
}  