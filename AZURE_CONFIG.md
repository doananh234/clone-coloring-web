# Azure FLUX 1.1 Pro Configuration

This document describes the environment variables required for Azure FLUX 1.1 Pro integration.

## Required Environment Variables

Create a `.env.local` file in the project root with the following variables:

```bash
# Azure OpenAI Configuration for FLUX 1.1 Pro
AZURE_OPENAI_ENDPOINT=https://iroly-resource.services.ai.azure.com/
AZURE_OPENAI_API_KEY=
DEPLOYMENT_NAME=
OPENAI_API_VERSION=2025-04-01-preview
```

## API Endpoints

The service uses the following Azure endpoints:

- **Image Generation**: `{ENDPOINT}/openai/deployments/{DEPLOYMENT}/images/generations?api-version={API_VERSION}`
- **Image Editing**: `{ENDPOINT}/openai/deployments/{DEPLOYMENT}/images/edits?api-version={API_VERSION}`

## Image Specifications

- **Default Size**: 1024x1024 (square format as per Flux 1.1 Pro)
- **Icon Size**: 1024x1024 (square format for category icons)
- **Output Format**: PNG
- **Authentication**: Bearer token using API key

## Usage Examples

### Generate Style Sample

```typescript
const result = await AzureFluxService.generateStyleSample(
  'A beautiful pet portrait'
);
```

### Generate Category Icon

```typescript
const result = await AzureFluxService.generateIcon('A cute dog icon');
```

### Edit Image

```typescript
const result = await AzureFluxService.editImage({
  prompt: 'Make the background blue',
  image: imageBuffer,
});
```

## Error Handling

The service returns a standardized result object:

```typescript
interface AzureServiceResult {
  success: boolean;
  imageUrl?: string;
  imageBuffer?: Buffer;
  error?: string;
}
```

## Security Notes

- Never commit API keys to version control
- Use environment variables for all sensitive configuration
- The API key provided is for development/testing purposes
- For production, use Azure Key Vault or similar secure storage
