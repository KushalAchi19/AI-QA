import { test, expect, Page } from '@playwright/test';

// Define the base URL for the local server
const BASE_URL = 'http://localhost:3030';

test.describe('Pediredla Shyam - Portfolio E2E Tests', () => {
    let page: Page;

    // Navigate to the base URL before each test
    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(BASE_URL);
    });

    // Close the page after each test
    test.afterEach(async () => {
        await page.close();
    });

    test('should have the correct page title and header content', async () => {
        // Assert page title
        await expect(page).toHaveTitle(/Pediredla Shyam - Portfolio/);

        // Assert header visibility and content
        const headerH1 = page.locator('header h1');
        await expect(headerH1).toBeVisible();
        await expect(headerH1).toHaveText('Pediredla Shyam');

        const headerP = page.locator('header p');
        await expect(headerP).toBeVisible();
        await expect(headerP).toHaveText('Computer Science Student | Web Developer | Problem Solver');
    });

    test('should display the navigation bar and allow scrolling to sections', async () => {
        const navLinks = page.locator('nav a');
        await expect(navLinks).toHaveCount(4); // Expect 4 navigation links

        // Test "About Me" link
        const aboutLink = navLinks.filter({ hasText: 'About Me' });
        await expect(aboutLink).toBeVisible();
        await aboutLink.click();
        const aboutSection = page.locator('#about');
        await expect(aboutSection).toBeVisible();
        // Optional: Check if it's scrolled into view (Playwright handles scroll on click)
        await expect(aboutSection).toBeInViewport(); 

        // Test "Skills" link
        const skillsLink = navLinks.filter({ hasText: 'Skills' });
        await expect(skillsLink).toBeVisible();
        await skillsLink.click();
        const skillsSection = page.locator('#skills');
        await expect(skillsSection).toBeVisible();
        await expect(skillsSection).toBeInViewport();

        // Test "Projects" link
        const projectsLink = navLinks.filter({ hasText: 'Projects' });
        await expect(projectsLink).toBeVisible();
        await projectsLink.click();
        const projectsSection = page.locator('#projects');
        await expect(projectsSection).toBeVisible();
        await expect(projectsSection).toBeInViewport();

        // Test "Contact" link
        const contactLink = navLinks.filter({ hasText: 'Contact' });
        await expect(contactLink).toBeVisible();
        await contactLink.click();
        const contactSection = page.locator('#contact');
        await expect(contactSection).toBeVisible();
        await expect(contactSection).toBeInViewport();
    });

    test('should display content for the "About Me" section', async () => {
        const aboutSection = page.locator('#about');
        await expect(aboutSection).toBeVisible();

        const aboutHeading = aboutSection.locator('h2');
        await expect(aboutHeading).toBeVisible();
        await expect(aboutHeading).toHaveText('About Me');

        const aboutParagraph = aboutSection.locator('p');
        await expect(aboutParagraph).toBeVisible();
        // Check for key phrase instead of exact match for long text
        await expect(aboutParagraph).toContainText('Motivated Computer Science student');
        await expect(aboutParagraph).toContainText('React.js, Node.js, and MongoDB');
    });

    test('should display content for the "Skills & Interests" section', async () => {
        const skillsSection = page.locator('#skills');
        await expect(skillsSection).toBeVisible();

        const skillsHeading = skillsSection.locator('h2');
        await expect(skillsHeading).toBeVisible();
        await expect(skillsHeading).toHaveText('Skills & Interests');

        // Check for specific skills and interests
        await expect(skillsSection.locator('h3').first()).toHaveText('Skills');
        await expect(skillsSection.locator('ul li').filter({ hasText: 'Frontend: HTML, CSS, JavaScript, React.js' })).toBeVisible();
        await expect(skillsSection.locator('ul li').filter({ hasText: 'Backend: Node.js, Express.js' })).toBeVisible();
        await expect(skillsSection.locator('ul li').filter({ hasText: 'Databases: SQL, MongoDB' })).toBeVisible();

        await expect(skillsSection.locator('h3').nth(1)).toHaveText('Interests');
        await expect(skillsSection.locator('ul li').filter({ hasText: 'Web Development' })).toBeVisible();
        await expect(skillsSection.locator('ul li').filter({ hasText: 'Cybersecurity & Ethical Hacking' })).toBeVisible();
        await expect(skillsSection.locator('ul li').filter({ hasText: 'Problem Solving (200+ LeetCode problems)' })).toBeVisible();
    });

    test('should display content for the "Projects" section and check project link', async () => {
        const projectsSection = page.locator('#projects');
        await expect(projectsSection).toBeVisible();

        const projectsHeading = projectsSection.locator('h2');
        await expect(projectsHeading).toBeVisible();
        await expect(projectsHeading).toHaveText('Projects');

        const projectDiv = projectsSection.locator('.project');
        await expect(projectDiv).toBeVisible();

        const projectTitle = projectDiv.locator('h3');
        await expect(projectTitle).toBeVisible();
        await expect(projectTitle).toHaveText('Comicol');

        const projectDescription = projectDiv.locator('p');
        await expect(projectDescription).toBeVisible();
        await expect(projectDescription).toContainText('An Ecommerce Website for comic books');
        await expect(projectDescription).toContainText('Stripe payment integration, JWT authentication');

        // Test the project link attributes
        const projectLink = projectDiv.locator('a', { hasText: 'View Project' });
        await expect(projectLink).toBeVisible();
        await expect(projectLink).toHaveAttribute('href', 'https://github.com/SpringMan-Sonic/comicol');
        await expect(projectLink).toHaveAttribute('target', '_blank');

        // Optional: Test opening the external link (this will open a new tab/popup)
        // Note: For actual external navigation, consider mocking or just asserting attributes.
        // For a full E2E, this might open a new page that Playwright can interact with.
        // For this scenario, just checking attributes is sufficient for a smoke test.
    });

    test('should display content for the "Contact" section and check links', async () => {
        const contactSection = page.locator('#contact');
        await expect(contactSection).toBeVisible();

        const contactHeading = contactSection.locator('h2');
        await expect(contactHeading).toBeVisible();
        await expect(contactHeading).toHaveText('Contact');

        // Check email link
        const emailLink = contactSection.locator('p', { hasText: 'Email:' }).locator('a');
        await expect(emailLink).toBeVisible();
        await expect(emailLink).toHaveText('shyamssv999@gmail.com');
        await expect(emailLink).toHaveAttribute('href', 'mailto:shyamssv999@gmail.com');

        // Check phone number presence (no link)
        await expect(contactSection.locator('p', { hasText: 'Phone: 7386638449' })).toBeVisible();

        // Check LinkedIn link
        const linkedinLink = contactSection.locator('p', { hasText: 'LinkedIn:' }).locator('a');
        await expect(linkedinLink).toBeVisible();
        await expect(linkedinLink).toHaveText('Profile');
        await expect(linkedinLink).toHaveAttribute('href', 'https://www.linkedin.com/in/pediredla-shyam-b70a052a2/');
        await expect(linkedinLink).toHaveAttribute('target', '_blank');

        // Check GitHub link
        const githubLink = contactSection.locator('p', { hasText: 'GitHub:' }).locator('a');
        await expect(githubLink).toBeVisible();
        await expect(githubLink).toHaveText('Profile');
        await expect(githubLink).toHaveAttribute('href', 'https://github.com/SpringMan-Sonic');
        await expect(githubLink).toHaveAttribute('target', '_blank');

        // Check LeetCode link
        const leetcodeLink = contactSection.locator('p', { hasText: 'LeetCode:' }).locator('a');
        await expect(leetcodeLink).toBeVisible();
        await expect(leetcodeLink).toHaveText('Profile');
        await expect(leetcodeLink).toHaveAttribute('href', 'https://leetcode.com/u/Shyamonly/');
        await expect(leetcodeLink).toHaveAttribute('target', '_blank');
    });

    test('should display the footer content', async () => {
        const footer = page.locator('footer');
        await expect(footer).toBeVisible();
        await expect(footer).toHaveText('© 2025 Pediredla Shyam. All Rights Reserved.');
    });
});