# iroly Dashboard Setup

## Environment Configuration

Create a `.env.local` file in the root directory with your Firebase configuration:

```env
# Development Environment
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=iroly-development.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=iroly-development
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=iroly-development.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here

# Production Environment (uncomment and use for production)
# NEXT_PUBLIC_FIREBASE_API_KEY=your_prod_api_key_here
# NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=iroly-production.firebaseapp.com
# NEXT_PUBLIC_FIREBASE_PROJECT_ID=iroly-production
# NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=iroly-production.appspot.com
# NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_prod_sender_id_here
# NEXT_PUBLIC_FIREBASE_APP_ID=your_prod_app_id_here
```

## Firebase Collections

The dashboard expects the following Firestore collections:

- `prompt-styles` - Contains style prompts for pet fashion generation
- `prompt-categories` - Contains category definitions with icon/thumbnail prompts
- `categories` - Contains category metadata
- `styles` - Contains style metadata

## Running the Dashboard

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Start the development server:

   ```bash
   yarn dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

### Tab 1: Categories

- View all categories with icons, styles, and sample images
- Generate icons and thumbnails for categories
- See style count and credit costs per category

### Tab 2: Prompts

- View and edit all style prompts
- Add new prompts
- Search and filter prompts
- Delete prompts

### Tab 3: Generate Icons

- Select categories to generate icons or thumbnails
- Preview prompts before generation
- Batch generation with credit cost estimation

### Tab 4: Generate Samples

- Select styles to generate sample images
- Search and filter styles
- Batch generation with time and credit estimation
