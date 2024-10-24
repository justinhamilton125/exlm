import { marked } from 'marked';  
import { decorateBlock, loadBlock } from '../../scripts/lib-franklin.js';  
  
export default function decorate(block) {  
  // Function to fetch and convert Markdown content from the given URL  
  const fetchMarkdownContent = async (url) => {  
    try {  
      console.log(`Fetching Markdown content from: ${url}`);  
      const response = await fetch(url);  
      if (!response.ok) {  
        throw new Error(`Failed to fetch content from ${url} - Status: ${response.status}`);  
      }  
      const markdownContent = await response.text();  
      console.log('Fetched Markdown content:', markdownContent);  
      return markdownContent;  
    } catch (error) {  
      console.error('Error fetching Markdown content:', error);  
      throw error;  
    }  
  };  
  
  // Function to fetch, convert, and decorate the content  
  const fetchAndRedecorate = async (url, targetBlock) => {  
    try {  
      // Fetch the Markdown content from the URL  
      const markdownString = await fetchMarkdownContent(url);  
      console.log('Fetched Markdown content:', markdownString); // Debug log  
  
      // Convert Markdown to HTML  
      const htmlString = marked(markdownString);  
      console.log('Converted HTML content:', htmlString); // Debug log  
  
      // Create a new DOM parser to parse the converted HTML string  
      const parser = new DOMParser();  
      const doc = parser.parseFromString(htmlString, 'text/html');  
  
      // Get all top-level elements in the parsed HTML  
      const elements = doc.body.children;  
  
      if (elements.length === 0) {  
        console.warn('No content found in the converted HTML');  
      }  
  
      // Clear the target block before appending new content  
      targetBlock.innerHTML = '';  
  
      Array.from(elements).forEach((element) => {  
        targetBlock.appendChild(element); // Append the element  
        decorateBlock(element); // Decorate the element  
        loadBlock(element); // Load the element  
      });  
    } catch (error) {  
      // Replace console.error with a custom logging function if needed  
      console.error('Error fetching or redecorating:', error);  
    }  
  };  
  
  // Function to extract URL from the block and call fetchAndRedecorate  
  const extractAndRedecorate = () => {  
    const converterLinkElement = block.querySelector('a'); // Look for an <a> tag in the block  
    if (converterLinkElement) {  
      const converterLink = converterLinkElement.href; // Extract the converter link  
      console.log('Converter link found:', converterLink);  
      fetchAndRedecorate(converterLink, block); // Pass the converter link and the converter block itself  
    } else {  
      console.error("Converter URL not found in the block.");  
    }  
  };  
  
  // Call the function to extract the converter link and redecorate the block  
  extractAndRedecorate();  
}  