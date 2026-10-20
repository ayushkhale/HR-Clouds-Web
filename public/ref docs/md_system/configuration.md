# Configuration & Environment Variables

## Overview
HRMS relies heavily on environment variables (`.env`) for configuring connections, secrets, and third-party integrations.
The system uses the `dotenv` package (loaded in `app.js`) to inject these into `process.env`.

## Core Variables

### Server
- `PORT`: The port the Express server listens on (default 3000).
- `NODE_ENV`: `development`, `staging`, or `production`. Controls logging verbosity and error stack trace visibility.

### Database (PostgreSQL)
- `DB_HOST`: Database host IP or hostname.
- `DB_PORT`: Database port (usually 5432).
- `DB_USER`: Database username.
- `DB_PASSWORD`: Database password.
- `DB_NAME`: The name of the database.

### Cache & Session (Redis)
- `REDIS_URL` or (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`): Connection string for Redis. Used heavily for:
  - JWT token blacklisting.
  - Invitation token storage (`org_invite:<hash>`).

### Security
- `JWT_SECRET`: Secret key for signing Access Tokens. Must be a strong random string.
- `JWT_REFRESH_SECRET`: Secret key for signing Refresh Tokens.
- `JWT_EXPIRES_IN`: e.g., `1h`, `15m`.
- `JWT_REFRESH_EXPIRES_IN`: e.g., `7d`.

### Third-Party Integrations
- **Razorpay**:
  - `RAZORPAY_KEY_ID`: Public key for initiating orders.
  - `RAZORPAY_KEY_SECRET`: Secret key for verifying webhook/payment signatures.
- **Brevo (Sendinblue)**:
  - `BREVO_API_KEY`: Used for dispatching invitation and password reset emails.
- **Google OAuth**:
  - `GOOGLE_CLIENT_ID`: OAuth client ID.
  - `GOOGLE_CLIENT_SECRET`: OAuth client secret.

## Config Files
- `configs/default.json`: Contains application-level configurations that don't need to be secret, such as:
  - CORS `allowedOrigins`.
  - Default pagination limits.
  - Role priority definitions.
