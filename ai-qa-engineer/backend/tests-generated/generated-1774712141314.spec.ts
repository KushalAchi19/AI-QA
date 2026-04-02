import { test, expect } from '@playwright/test';

test.describe('Pediredla Shyam - Portfolio E2E Tests', () => {

    // Base URL for the local server
    const BASE_URL = 'http://localhost:3030';

    // Before each test, navigate to the base URL
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
    });

    test('should load the page and display the header correctly', async ({ page }) => {
        // Assert that the page title is correct
        await expect(page).toHaveTitle('Pediredla Shyam - Portfolio');

        // Assert that the main heading and subtitle in the header are visible and correct
        await expect(page.locator('header h1')).toBeVisible();
        await expect(page.locator('header h1')).toHaveText('Pediredla Shyam');
        await expect(page.locator('header p')).toBeVisible();
        await expect(page.locator('header p')).toHaveText('Computer Science Student | Web Developer | Problem Solver');
    });

    test('should have working navigation links that scroll to sections', async ({ page }) => {
        // Test 'About Me' navigation
        await page.locator('nav a', { hasText: 'About Me' }).click();
        await expect(page.locator('#about')).toBeInViewport(); // Checks if the element is visible within the viewport
        await expect(page.locator('#about h2')).toHaveText('About Me');

        // Test 'Skills' navigation
        await page.locator('nav a', { hasText: 'Skills' }).click();
        await expect(page.locator('#skills')).toBeInViewport();
        await expect(page.locator('#skills h2')).toHaveText('Skills & Interests');

        // Test 'Projects' navigation
        await page.locator('nav a', { hasText: 'Projects' }).click();
        await expect(page.locator('#projects')).toBeInViewport();
        await expect(page.locator('#projects h2')).toHaveText('Projects');

        // Test 'Contact' navigation
        await page.locator('nav a', { hasText: 'Contact' }).click();
        await expect(page.locator('#contact')).toBeInViewport();
        await expect(page.locator('#contact h2')).toHaveText('Contact');
    });

    test('should display content within the "About Me" section', async ({ page }) => {
        // Navigate to the section first for robustness, though it's visible on load
        await page.locator('nav a', { hasText: 'About Me' }).click();
        await expect(page.locator('#about h2')).toBeVisible();
        await expect(page.locator('#about p')).toContainText('Motivated Computer Science student');
        await expect(page.locator('#about p')).toContainText('React.js, Node.js, and MongoDB');
    });

    test('should display content within the "Skills & Interests" section', async ({ page }) => {
        await page.locator('nav a', { hasText: 'Skills' }).click();
        await expect(page.locator('#skills h2')).toBeVisible();
        await expect(page.locator('#skills h3', { hasText: 'Skills' })).toBeVisible();
        await expect(page.locator('#skills h3', { hasText: 'Interests' })).toBeVisible();
        await expect(page.locator('#skills ul li', { hasText: 'HTML, CSS, JavaScript, React.js' })).toBeVisible();
        await expect(page.locator('#skills ul li', { hasText: 'Node.js, Express.js' })).toBeVisible();
        await expect(page.locator('#skills ul li', { hasText: 'SQL, MongoDB' })).toBeVisible();
        await expect(page.locator('#skills ul li', { hasText: 'Web Development' })).toBeVisible();
        await expect(page.locator('#skills ul li', { hasText: 'Problem Solving (200+ LeetCode problems)' })).toBeVisible();
    });

    test('should display project details within the "Projects" section and verify external link', async ({ page }) => {
        await page.locator('nav a', { hasText: 'Projects' }).click();
        await expect(page.locator('#projects h2')).toBeVisible();
        
        const projectDiv = page.locator('.project');
        await expect(projectDiv).toBeVisible();
        await expect(projectDiv.locator('h3')).toHaveText('Comicol');
        await expect(projectDiv.locator('p')).toContainText('An Ecommerce Website for comic books');

        // Verify the project external link
        const projectLink = projectDiv.locator('a', { hasText: 'View Project' });
        await expect(projectLink).toBeVisible();
        await expect(projectLink).toHaveAttribute('href', 'https://github.com/SpringMan-Sonic/comicol');
        await expect(projectLink).toHaveAttribute('target', '_blank'); // Ensure it opens in a new tab
    });

    test('should display contact details within the "Contact" section and verify external links', async ({ page }) => {
        await page.locator('nav a', { hasText: 'Contact' }).click();
        await expect(page.locator('#contact h2')).toBeVisible();

        // Verify Email
        await expect(page.locator('#contact p', { hasText: 'Email:' })).toBeVisible();
        const emailLink = page.locator('#contact a', { hasText: 'shyamssv999@gmail.com' });
        await expect(emailLink).toBeVisible();
        await expect(emailLink).toHaveAttribute('href', 'mailto:shyamssv999@gmail.com');

        // Verify Phone (text content)
        await expect(page.locator('#contact p', { hasText: 'Phone: 7386638449' })).toBeVisible();

        // Verify LinkedIn link
        const linkedinLink = page.locator('#contact p:has-text("LinkedIn:") a'); // Use `:has-text` to target the parent <p> and then find 'a'
        await expect(linkedinLink).toBeVisible();
        await expect(linkedinLink).toHaveText('Profile');
        await expect(linkedinLink).toHaveAttribute('href', 'https://www.linkedin.com/in/pediredla-shyam-b70a052a2/');
        await expect(linkedinLink).toHaveAttribute('target', '_blank');

        // Verify GitHub link
        const githubLink = page.locator('#contact p:has-text("GitHub:") a');
        await expect(githubLink).toBeVisible();
        await expect(githubLink).toHaveText('Profile');
        await expect(githubLink).toHaveAttribute('href', 'https://github.com/SpringMan-Sonic');
        await expect(githubLink).toHaveAttribute('target', '_blank');

        // Verify LeetCode link
        const leetcodeLink = page.locator('#contact p:has-text("LeetCode:") a');
        await expect(leetcodeLink).toBeVisible();
        await expect(leetcodeLink).toHaveText('Profile');
        await expect(leetcodeLink).toHaveAttribute('href', 'https://leetcode.com/u/Shyamonly/');
        await expect(leetcodeLink).toHaveAttribute('target', '_blank');
    });

    test('should display the footer copyright information', async ({ page }) => {
        // Assert that the footer is visible and contains the copyright text
        await expect(page.locator('footer')).toBeVisible();
        await expect(page.locator('footer')).toContainText('© 2025 Pediredla Shyam. All Rights Reserved.');
    });
});