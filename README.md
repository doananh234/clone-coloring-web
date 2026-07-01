# iroly Dashboard

A Next.js dashboard application for managing pet-related content with AI-powered image generation using Azure FLUX.1-Kontext-pro.

## Features

- **AI Image Generation**: Generate pet portraits and category icons using Azure FLUX.1-Kontext-pro
- **Category Management**: Create and manage pet categories with custom icons
- **Style Samples**: Generate style samples for different pet photography styles
- **Firebase Integration**: Store and manage images in Firebase Storage
- **Modern UI**: Built with Next.js, TypeScript, and Tailwind CSS

## Azure FLUX.1-Kontext-pro Integration

This project integrates with Azure's FLUX.1-Kontext-pro model for:

- **Text-to-Image Generation**: Create pet portraits and category icons
- **Image Editing**: Edit existing images with AI
- **3:4 Aspect Ratio**: Optimized for pet photography (1024x1365 for style samples, 768x1024 for icons)

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn or npm
- Azure OpenAI service with FLUX.1-Kontext-pro deployment
- Firebase project for storage

### Environment Setup

Create a `.env.local` file with the following variables:

```bash
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://iroly-resource.cognitiveservices.azure.com/
AZURE_OPENAI_API_KEY=your-api-key-here
DEPLOYMENT_NAME=FLUX.1-Kontext-pro
OPENAI_API_VERSION=2025-04-01-preview

# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
```

### Installation

```bash
# Install dependencies
yarn install

# Run development server
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

### Testing Azure Integration

Visit [http://localhost:3000/test-api](http://localhost:3000/test-api) to test the Azure FLUX.1-Kontext-pro integration with sample prompts.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
