// tests/portfolio.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Pediredla Shyam - Portfolio Website E2E Tests', () => {
  const BASE_URL = 'http://localhost:3030';

  // Before each test, navigate to the base URL
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('should display the correct page title', async ({ page }) => {
    // Assert that the page title matches the expected value
    await expect(page).toHaveTitle(/Pediredla Shyam - Portfolio/);
  });

  test('should have a visible header with name and role', async ({ page }) => {
    // Locate the header H1 element and assert its visibility and text content
    const headerH1 = page.locator('header h1');
    await expect(headerH1).toBeVisible();
    await expect(headerH1).toHaveText('Pediredla Shyam');

    // Locate the header P element and assert its visibility and text content
    const headerP = page.locator('header p');
    await expect(headerP).toBeVisible();
    await expect(headerP).toHaveText('Computer Science Student | Web Developer | Problem Solver');
  });

  test('navigation links should be visible and lead to correct sections', async ({ page }) => {
    // Get all navigation links within the <nav> element
    const navLinks = page.locator('nav a');
    // Assert that there are exactly 4 navigation links
    await expect(navLinks).toHaveCount(4);

    // Test each navigation link
    const linksAndSections = [
      { text: 'About Me', sectionId: '#about' },
      { text: 'Skills', sectionId: '#skills' },
      { text: 'Projects', sectionId: '#projects' },
      { text: 'Contact', sectionId: '#contact' },
    ];

    for (const { text, sectionId } of linksAndSections) {
      const link = navLinks.filter({ hasText: text });
      // Assert that the link is visible
      await expect(link).toBeVisible();
      // Click the navigation link
      await link.click();
      // Assert that the URL hash contains the section ID
      await expect(page.url()).toContain(sectionId);
      // Assert that the target section is visible
      await expect(page.locator(sectionId)).toBeVisible();
    }
  });

  test('About Me section should display its heading and paragraph content', async ({ page }) => {
    // Locate the heading for the About Me section and assert its visibility and text
    const aboutHeading = page.locator('#about h2');
    await expect(aboutHeading).toBeVisible();
    await expect(aboutHeading).toHaveText('About Me');

    // Locate the paragraph within the About Me section and assert its visibility
    await expect(page.locator('#about p')).toBeVisible();
    // A more specific text assertion could be added here if the content is highly critical
  });

  test('Skills & Interests section should list skills and interests', async ({ page }) => {
    // Locate the heading for the Skills & Interests section and assert its visibility and text
    const skillsHeading = page.locator('#skills h2');
    await expect(skillsHeading).toBeVisible();
    await expect(skillsHeading).toHaveText('Skills & Interests');

    // Assert that skill/interest list items are visible and contain key texts
    await expect(page.locator('#skills ul li:has-text("HTML")')).toBeVisible();
    await expect(page.locator('#skills ul li:has-text("React.js")')).toBeVisible();
    await expect(page.locator('#skills ul li:has-text("Node.js")')).toBeVisible();
    await expect(page.locator('#skills ul li:has-text("MongoDB")')).toBeVisible();
    await expect(page.locator('#skills ul li:has-text("Web Development")')).toBeVisible();
    await expect(page.locator('#skills ul li:has-text("Problem Solving")')).toBeVisible();
  });

  test('Projects section should display "Comicol" project with a functional link', async ({ page }) => {
    // Locate the heading for the Projects section and assert its visibility and text
    const projectsHeading = page.locator('#projects h2');
    await expect(projectsHeading).toBeVisible();
    await expect(projectsHeading).toHaveText('Projects');

    // Locate the project title within the '.project' class and assert its visibility and text
    const projectTitle = page.locator('.project h3');
    await expect(projectTitle).toBeVisible();
    await expect(projectTitle).toHaveText('Comicol');

    // Locate the project link, assert its visibility, text, href, and target attribute
    const projectLink = page.locator('.project a');
    await expect(projectLink).toBeVisible();
    await expect(projectLink).toHaveText('View Project');
    await expect(projectLink).toHaveAttribute('href', 'https://github.com/SpringMan-Sonic/comicol');
    await expect(projectLink).toHaveAttribute('target', '_blank'); // Ensure it opens in a new tab
  });

  test('Contact section should display contact information and external profile links', async ({ page }) => {
    // Locate the heading for the Contact section and assert its visibility and text
    const contactHeading = page.locator('#contact h2');
    await expect(contactHeading).toBeVisible();
    await expect(contactHeading).toHaveText('Contact');

    // Email link verification
    const emailLink = page.locator('#contact a[href^="mailto:"]');
    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveText('shyamssv999@gmail.com');
    await expect(emailLink).toHaveAttribute('href', 'mailto:shyamssv999@gmail.com');

    // Phone number verification
    await expect(page.locator('#contact p:has-text("Phone:")')).toContainText('7386638449');

    // LinkedIn profile link verification
    const linkedinLink = page.locator('#contact a[href*="linkedin.com"]');
    await expect(linkedinLink).toBeVisible();
    await expect(linkedinLink).toHaveText('Profile');
    await expect(linkedinLink).toHaveAttribute('href', 'https://www.linkedin.com/in/pediredla-shyam-b70a052a2/');
    await expect(linkedinLink).toHaveAttribute('target', '_blank');

    // GitHub profile link verification
    const githubLink = page.locator('#contact a[href="https://github.com/SpringMan-Sonic"]');
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveText('Profile');
    await expect(githubLink).toHaveAttribute('href', 'https://github.com/SpringMan-Sonic');
    await expect(githubLink).toHaveAttribute('target', '_blank');

    // LeetCode profile link verification
    const leetcodeLink = page.locator('#contact a[href*="leetcode.com"]');
    await expect(leetcodeLink).toBeVisible();
    await expect(leetcodeLink).toHaveText('Profile');
    await expect(leetcodeLink).toHaveAttribute('href', 'https://leetcode.com/u/Shyamonly/');
    await expect(leetcodeLink).toHaveAttribute('target', '_blank');
  });

  test('should display a visible footer with correct copyright information', async ({ page }) => {
    // Locate the footer element and assert its visibility and text content
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer).toHaveText(/© 2025 Pediredla Shyam. All Rights Reserved./);
  });
});