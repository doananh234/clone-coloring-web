# Firestore Database Setup (Optimized)

This project uses Firebase Admin SDK with service account files for server-side database operations, optimized for cost efficiency with a single collection structure.

## 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Follow the setup wizard

## 2. Enable Firestore Database

1. In the Firebase Console, go to **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** for development (you can secure it later)
4. Select a location for your database

## 3. Generate Service Account Keys

### For Development:

1. Go to **Project Settings** > **Service accounts**
2. Click **Generate new private key**
3. Save the file as `service-account.development.json` in your project root

### For Production:

1. Create a separate Firebase project for production
2. Generate a new private key
3. Save the file as `service-account.production.json` in your project root

## 4. Service Account Files

Place the service account JSON files in your project root:

- `service-account.development.json` - For development environment
- `service-account.production.json` - For production environment

**Important**: Add these files to `.gitignore` to keep them secure!

## 5. Install Dependencies

The required Firebase dependencies are already installed:

- `firebase-admin` - Firebase Admin SDK for server-side operations

## 6. Optimized Database Structure

The app uses a **single collection** structure to minimize Firestore costs:

### Categories Collection (`categories`)

```typescript
{
  id: string,
  name: string,
  displayName: string,
  description: string,
  iconPrompt: string,
  thumbnailPrompt: string,
  iconUrl?: string,
  thumbnailUrl?: string,
  styles: Style[], // Nested styles array
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Style Object (nested in categories)

```typescript
{
  id: string,
  name: string,
  prompt: string,
  description: string,
  creditCost: number,
  originalImageUrl?: string,
  generatedImageUrl?: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Cost Benefits:**

- ✅ **Single Collection**: Reduces read/write operations
- ✅ **Nested Data**: Styles are stored within categories
- ✅ **Fewer Documents**: One document per category instead of separate style documents
- ✅ **Atomic Updates**: Category and styles updated together

## 7. API Routes

The app uses Next.js API routes for database operations:

- `GET /api/categories` - Get all categories with styles
- `POST /api/categories` - Create new category
- `GET /api/categories/[id]` - Get category by ID
- `PUT /api/categories/[id]` - Update category
- `DELETE /api/categories/[id]` - Delete category
- `GET /api/categories/[id]/styles` - Get styles for category
- `POST /api/categories/[id]/styles` - Create style in category
- `GET /api/styles/[id]` - Get style by ID
- `PUT /api/styles/[id]` - Update style
- `DELETE /api/styles/[id]` - Delete style

## 8. Features

✅ **Server-side Operations**: Uses Firebase Admin SDK for secure operations
✅ **Cost Optimized**: Single collection with nested data structure
✅ **CRUD Operations**: Full create, read, update, delete functionality
✅ **Loading States**: Shows loading spinner while data is being fetched
✅ **Error Handling**: Displays error messages and retry options
✅ **Data Persistence**: All changes are saved to Firestore
✅ **Automatic Migration**: Sample data is loaded on first run
✅ **Environment-based**: Different service accounts for dev/prod

## 9. Security

- **Service Account Authentication**: Uses Firebase Admin SDK with service account keys
- **Server-side Only**: Database operations happen on the server, not client
- **Environment Separation**: Different service accounts for development and production
- **Secure File Handling**: Service account files are not exposed to the client

## 10. Testing

1. Place your service account files in the project root
2. Start the development server: `yarn dev`
3. Open the app in your browser
4. Try creating, editing, and deleting categories and styles
5. Refresh the page to verify data persistence
6. Check the Firebase Console to see your data

## Troubleshooting

- **"Firebase Admin not initialized"**: Check your service account files exist and are valid
- **"Permission denied"**: Verify your service account has Firestore permissions
- **"File not found"**: Ensure service account files are in the project root
- **Data not loading**: Check server console for errors and verify Firestore is enabled
- **Build errors**: Make sure service account files are properly formatted JSON
