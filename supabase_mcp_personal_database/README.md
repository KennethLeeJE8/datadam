# Personal Data Bank

This project is a Model Context Protocol (MCP) server for managing personal data using Supabase. It provides secure CRUD operations and integrates with Supabase for database management with comprehensive Row Level Security (RLS) and audit logging.

## Project Structure

- **src/**: Contains the source code for the project.
  - **database/**: Includes the Supabase client configuration and schema.
    - `client.ts`: Sets up the Supabase client with environment variables for connection.
    - `schema.sql`: Complete database schema with tables, RLS policies, and RPC functions.
    - `types.ts`: TypeScript type definitions for database entities.
  - **createTables.ts**: Test script for creating authenticated users and sample data.
  - **checkConnection.ts**: A script to test the connection to the Supabase database.

## Database Setup

### 1. Deploy the Database Schema

The `src/database/schema.sql` file contains the complete database setup including:
- ✅ **Tables**: `profiles`, `personal_data`, `data_field_definitions`, `data_access_log`
- ✅ **Row Level Security (RLS)**: Comprehensive policies for data isolation
- ✅ **RPC Functions**: Advanced operations like search, bulk updates, GDPR compliance
- ✅ **Indexes**: Performance optimizations for all tables
- ✅ **Triggers**: Automatic timestamp updates
- ✅ **Sample Data**: Test records for development

**When to use `schema.sql`:**
- ✅ **First-time setup**: When setting up a new Supabase project
- ✅ **Schema updates**: When adding new tables or modifying existing ones
- ✅ **Production deployment**: For deploying to staging/production environments
- ✅ **Team onboarding**: When new developers need to set up their local database

**How to deploy:**
1. Create a test user in Supabase Dashboard:
   - Go to **Authentication > Users**
   - Click **"Add User"**
   - Email: `sample@example.com`, Password: `TestPassword123!`
   - Copy the generated UUID
2. Update `schema.sql`:
   - Find `YOUR_TEST_USER_UUID_HERE` (lines ~452, 467)
   - Replace with the UUID from step 1
3. Run the SQL script in your **Supabase SQL Editor**

### 2. Test Data Creation and Validation

The `src/createTables.ts` script provides comprehensive testing and data validation:
- ✅ **Authentication**: Creates real authenticated users via Supabase Auth
- ✅ **Data Verification**: Reads existing data before making changes
- ✅ **Test Data**: Creates profiles and field definitions with proper foreign keys
- ✅ **Audit Logging**: Logs all operations for compliance tracking
- ✅ **Conflict Avoidance**: Uses `test_` prefixes to avoid sample data conflicts

**When to use `createTables.ts`:**
- ✅ **After schema deployment**: To verify everything works correctly
- ✅ **Development testing**: For creating test data during development
- ✅ **CI/CD validation**: To test database connectivity in automated pipelines
- ✅ **Data migration testing**: To verify new schema changes work with existing data

**How to run:**
```bash
npm run build && node dist/createTables.js
```

**What it does:**
1. **Verifies tables exist**: Checks all 4 required tables are accessible
2. **Reads existing data**: Shows current database state (sample data from schema)
3. **Creates authenticated user**: Real user via `supabaseAdmin.auth.admin.createUser()`
4. **Creates test profile**: Links to real `auth.users` record (satisfies foreign key)
5. **Creates field definitions**: 5 test fields with validation rules
6. **Displays comprehensive summary**: Both sample and test data with totals

## Initial Setup

1. **Environment Variables**: Ensure you have a `.env` file in the root directory with the following variables:
   ```plaintext
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. **Install Dependencies**: Run `npm install` to install the necessary packages.

3. **Deploy Database Schema**: Follow the Database Setup section above.

## Available Scripts

### Database Connection Test
```bash
npx ts-node src/checkConnection.ts
```
Tests basic connectivity to Supabase database.

### Complete Database Setup and Testing
```bash
npm run build && node dist/createTables.js
```
Creates authenticated users, profiles, and field definitions with full audit logging.

### Development Build
```bash
npm run build
```
Compiles TypeScript to JavaScript in the `dist/` directory.

## Database Schema Overview

### Core Tables
- **`profiles`**: User profile information linked to `auth.users`
- **`personal_data`**: Main data storage with JSONB content and classification
- **`data_field_definitions`**: Dynamic schema definitions for data validation
- **`data_access_log`**: Comprehensive audit trail for all operations

### Security Features
- **Row Level Security (RLS)**: Users can only access their own data
- **Service Role Bypass**: Admin operations using `SUPABASE_SERVICE_ROLE_KEY`
- **Audit Logging**: All CRUD operations automatically logged
- **Data Classification**: Public, personal, sensitive, confidential levels

### Advanced Features
- **Search RPC**: `search_personal_data()` with filters and pagination
- **Bulk Operations**: `bulk_update_personal_data_tags()` for efficiency
- **GDPR Compliance**: `soft_delete_personal_data()` and `hard_delete_user_data()`
- **Data Export**: `export_user_data()` for data portability
- **Analytics**: `get_data_type_stats()` for reporting

## Current Status

- ✅ Complete database schema with RLS and RPC functions
- ✅ Authentication integration with real user creation
- ✅ Comprehensive test data creation and validation
- ✅ Audit logging for all operations
- ✅ GDPR compliance features (data export, deletion)
- ✅ Production-ready security policies
- ✅ Performance optimizations with proper indexing

The project is ready for MCP server implementation and production deployment. 