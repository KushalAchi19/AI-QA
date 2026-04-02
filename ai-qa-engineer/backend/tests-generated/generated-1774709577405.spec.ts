import { test, expect } from '@playwright/test';

// Define the base URL for the application
const BASE_URL = 'http://localhost:3030';

test.describe('Superpowers Application E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the base URL before each test
    await page.goto(BASE_URL);
  });

  test('should load the application and display the Home page correctly', async ({ page }) => {
    // Expect the document title to be 'Superpowers' as defined in public/index.html
    await expect(page).toHaveTitle('Superpowers');

    // Expect the main application container to be visible (from App.js)
    await expect(page.locator('div.App')).toBeVisible();

    // Expect the navigation links to be visible and have correct text (from App.js)
    const homeLink = page.getByTestId('nav-home-link');
    const profileLink = page.getByTestId('nav-profile-link');
    await expect(homeLink).toBeVisible();
    await expect(profileLink).toBeVisible();
    await expect(homeLink).toHaveText('Home');
    await expect(profileLink).toHaveText('Profile');

    // Expect the Home page specific header and description to be visible (from Home.js)
    const homeHeader = page.getByTestId('home-header');
    const homeDescription = page.getByTestId('home-description');
    await expect(homeHeader).toBeVisible();
    await expect(homeHeader).toHaveText('Welcome to Superpowers!');
    await expect(homeDescription).toBeVisible();
    await expect(homeDescription).toHaveText('Explore your unique abilities.');

    // Ensure the URL is correctly set to the root path
    await expect(page).toHaveURL(`${BASE_URL}/`);
  });

  test('should navigate from Home to Profile page and back', async ({ page }) => {
    // Ensure we are on the Home page initially by checking a unique element
    await expect(page.getByTestId('home-header')).toBeVisible();

    // Click on the Profile navigation link
    await page.getByTestId('nav-profile-link').click();

    // Expect to be on the Profile page after navigation
    await expect(page).toHaveURL(`${BASE_URL}/profile`);
    const profileHeader = page.getByTestId('profile-header'); // From Profile.js
    await expect(profileHeader).toBeVisible();
    await expect(profileHeader).toHaveText('Your Superpower Profile');

    // Expect initial profile details to be visible (from Profile.js)
    await expect(page.getByTestId('profile-name')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveText('Mysterious Hero');
    await expect(page.getByTestId('profile-power')).toBeVisible();
    await expect(page.getByTestId('profile-power')).toHaveText('Flight');

    // Click on the Home navigation link
    await page.getByTestId('nav-home-link').click();

    // Expect to be back on the Home page
    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(page.getByTestId('home-header')).toBeVisible();
  });

  test('should allow interacting with profile details on the Profile page', async ({ page }) => {
    // Navigate to the Profile page directly for this test
    await page.goto(`${BASE_URL}/profile`);

    // Expect the Profile page elements to be visible (from Profile.js)
    await expect(page.getByTestId('profile-header')).toBeVisible();
    const nameInput = page.getByTestId('name-input');
    const powerInput = page.getByTestId('power-input');
    const saveButton = page.getByTestId('save-button');
    const profileStatus = page.getByTestId('profile-status');

    await expect(nameInput).toBeVisible();
    await expect(powerInput).toBeVisible();
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toHaveText('Save Changes');

    // Input new values into the text fields
    const newName = 'Captain Awesome';
    const newPower = 'Super Strength';
    await nameInput.fill(newName);
    await powerInput.fill(newPower);

    // Click the save button
    await saveButton.click();

    // --- IMPORTANT NOTE REGARDING Profile.js ---
    // The provided Profile.js component does not include actual state management
    // or logic to update the displayed profile-name/profile-power spans
    // or the profile-status based on the input values or the button click.
    //
    // Therefore, in this test, we can only assert that the input fields
    // retain their filled values (as they are uncontrolled in the snippet)
    // and that the profile-status element exists.
    //
    // For a fully functional app, you'd expect the displayed 'profile-name'
    // and 'profile-power' to update, and 'profile-status' to show a message.

    // Assert that the input fields retain their values after "saving"
    await expect(nameInput).toHaveValue(newName);
    await expect(powerInput).toHaveValue(newPower);

    // Assert that the profile status element is visible. If it had logic
    // to display a message, we would assert its text content here.
    await expect(profileStatus).toBeVisible();
    // Example: await expect(profileStatus).toHaveText('Profile updated successfully!');
    // If there were server interaction: await expect(profileStatus).toHaveText('Saving profile...');
  });
});