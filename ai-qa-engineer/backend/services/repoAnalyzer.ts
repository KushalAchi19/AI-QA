import axios from 'axios';

/**
 * MVP Repository Analyzer
 * Fetches the root files from a public GitHub repository.
 */
export async function analyzeRepository(repoUrl: string) {
  try {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error("Invalid GitHub URL. Must be formatted like https://github.com/owner/repo");
    }
    
    const owner = match[1];
    // Remove .git if present
    const repo = match[2].replace('.git', '');

    // Fetch the root contents using GitHub REST API
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    // Return the list of files (excluding directories for the MVP to stay simple)
    const files = response.data.filter((item: any) => item.type === 'file');
    return files.map((f: any) => ({ name: f.name, path: f.path, download_url: f.download_url }));
    
  } catch (error: any) {
    console.error("Error analyzing repository:", error.message);
    throw new Error(`Failed to fetch repo data: ${error.message}`);
  }
}
