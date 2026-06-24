# Muslim Hands Dashboard

A comprehensive donor data visualization dashboard with multi-language support (French, English, Urdu) and Gemini-powered AI analysis.

## Setup & Run Locally

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Setup (Optional)**:
    Create a `.env` file in the root directory:
    ```
    VITE_API_KEY=your_google_gemini_api_key
    ```
    *Note: If you do not set this, the app will ask for an API key in the interface.*

3.  **Run Development Server (Web)**:
    ```bash
    npm run dev
    ```

## Building the Desktop Application (EXE / MSI)

To create a standalone installer for Windows:

1.  **Install Dependencies** (if you haven't already):
    ```bash
    npm install
    ```

2.  **Build the Installer**:
    ```bash
    npm run dist
    ```
    
    This command will:
    1. Build the React application (HTML/CSS/JS).
    2. Package it using Electron.
    3. Generate an installer in the `dist-electron` folder.

3.  **Locate the File**:
    Go to the `dist-electron` folder. You will find:
    - `Muslim Hands Dashboard Setup 1.0.0.exe` (Send this to users)
    - `Muslim Hands Dashboard 1.0.0.msi` (For IT admin deployment)

## Features

- **Standalone Desktop App**: Installs like a native Windows application.
- **CSV Import**: Upload donor data via CSV.
- **Multi-language**: Toggle between French, English, and Urdu.
- **AI Assistant**: Ask questions about your data using Google Gemini (Supports User API Key entry).
- **Interactive Charts**: Deep dive into donation trends, geography, and project allocation.
- **Export**: Download charts as JPG images.
