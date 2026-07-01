# Crawler Authentication Test Specification

## Overview
This document outlines comprehensive test cases for authentication handling in the crawler script (`scripts/crawl.ts`). It covers happy paths, failure cases, and edge cases for authentication scenarios.

## Test Categories

### 1. Happy Path Scenarios ✅

#### HP-1: Valid Authorization Token + Valid API Key (CLI Args)
**Description**: Both authorization token and API key provided via CLI arguments
**Input**:
```bash
yarn crawl --authorization "Bearer valid_token" --api-key "valid_api_key"
```
**Expected Behavior**:
- ✅ Headers include both `authorization` and `x-api-key`
- ✅ API request succeeds (200 OK)
- ✅ Listings are fetched successfully
- ✅ Metadata is saved to `assets/{listingId}/metadata.json`
- ✅ PDFs and images are downloaded successfully

#### HP-2: Valid Authorization Token + Valid API Key (Environment Variables)
**Description**: Both credentials provided via environment variables
**Input**:
```bash
CRAWL_AUTHORIZATION="Bearer valid_token" CRAWL_API_KEY="valid_api_key" yarn crawl
```
**Expected Behavior**:
- ✅ Headers include both `authorization` and `x-api-key` from env vars
- ✅ API request succeeds (200 OK)
- ✅ All operations complete successfully

#### HP-3: CLI Args Override Environment Variables
**Description**: CLI arguments take precedence over environment variables
**Input**:
```bash
CRAWL_AUTHORIZATION="Bearer env_token" CRAWL_API_KEY="env_key" \
yarn crawl --authorization "Bearer cli_token" --api-key "cli_key"
```
**Expected Behavior**:
- ✅ Headers use CLI values (`cli_token`, `cli_key`)
- ✅ Environment variables are ignored when CLI args are present
- ✅ API request uses CLI credentials

#### HP-4: Default Headers (Hard-coded in DEFAULT_HEADERS)
**Description**: Using default authorization and API key from DEFAULT_HEADERS constant
**Input**:
```bash
yarn crawl
```
**Expected Behavior**:
- ✅ Headers include default `authorization` and `x-api-key` from `DEFAULT_HEADERS`
- ✅ API request succeeds
- ✅ All operations complete successfully

#### HP-5: Partial Override (Only Authorization via CLI)
**Description**: Override only authorization, keep default API key
**Input**:
```bash
yarn crawl --authorization "Bearer custom_token"
```
**Expected Behavior**:
- ✅ Headers use custom `authorization` from CLI
- ✅ Headers use default `x-api-key` from `DEFAULT_HEADERS`
- ✅ API request succeeds

#### HP-6: Partial Override (Only API Key via CLI)
**Description**: Override only API key, keep default authorization
**Input**:
```bash
yarn crawl --api-key "custom_key"
```
**Expected Behavior**:
- ✅ Headers use default `authorization` from `DEFAULT_HEADERS`
- ✅ Headers use custom `x-api-key` from CLI
- ✅ API request succeeds

---

### 2. Failure Cases ❌

#### FC-1: Missing Authorization Header
**Description**: No authorization token provided (neither CLI, env, nor default)
**Input**:
```bash
# Remove authorization from DEFAULT_HEADERS and run:
yarn crawl --api-key "valid_key"
```
**Expected Behavior**:
- ⚠️ API request may succeed if API doesn't require auth
- ⚠️ OR API returns 401 Unauthorized
- ⚠️ Error message: `API request failed (page 1): 401 - Unauthorized`
- ⚠️ Script exits with code 1

#### FC-2: Missing API Key Header
**Description**: No API key provided (neither CLI, env, nor default)
**Input**:
```bash
# Remove x-api-key from DEFAULT_HEADERS and run:
yarn crawl --authorization "Bearer valid_token"
```
**Expected Behavior**:
- ⚠️ API request may succeed if API doesn't require API key
- ⚠️ OR API returns 401/403 Forbidden
- ⚠️ Error message: `API request failed (page 1): 401/403 - ...`
- ⚠️ Script exits with code 1

#### FC-3: Invalid/Expired Authorization Token
**Description**: Authorization token is invalid or expired
**Input**:
```bash
yarn crawl --authorization "Bearer expired_or_invalid_token" --api-key "valid_key"
```
**Expected Behavior**:
- ❌ API returns 401 Unauthorized
- ❌ Error message: `API request failed (page 1): 401 - Unauthorized`
- ❌ Script exits with code 1
- ❌ No listings fetched, no files downloaded

#### FC-4: Invalid API Key
**Description**: API key is invalid or incorrect
**Input**:
```bash
yarn crawl --authorization "Bearer valid_token" --api-key "invalid_key"
```
**Expected Behavior**:
- ❌ API returns 401/403 Forbidden
- ❌ Error message: `API request failed (page 1): 401/403 - ...`
- ❌ Script exits with code 1
- ❌ No listings fetched, no files downloaded

#### FC-5: Both Authorization and API Key Missing
**Description**: Neither credential provided
**Input**:
```bash
# Remove both from DEFAULT_HEADERS and run:
yarn crawl
```
**Expected Behavior**:
- ❌ API returns 401 Unauthorized (if API requires auth)
- ❌ OR API succeeds if it doesn't require auth
- ❌ Error handling should be graceful

#### FC-6: API Returns 401 Unauthorized
**Description**: Server explicitly rejects credentials
**Input**:
```bash
yarn crawl --authorization "Bearer invalid" --api-key "invalid"
```
**Expected Behavior**:
- ❌ HTTP 401 response
- ❌ Error message includes status code and response text
- ❌ Script exits with code 1
- ❌ Clear error message: `API request failed (page 1): 401 - Unauthorized`

#### FC-7: API Returns 403 Forbidden
**Description**: Server rejects request due to insufficient permissions
**Input**:
```bash
yarn crawl --authorization "Bearer valid_but_insufficient_token" --api-key "valid_key"
```
**Expected Behavior**:
- ❌ HTTP 403 response
- ❌ Error message: `API request failed (page 1): 403 - Forbidden`
- ❌ Script exits with code 1

#### FC-8: API Returns 429 Rate Limited
**Description**: Too many requests in short time
**Input**:
```bash
# Make multiple rapid requests
for i in {1..10}; do yarn crawl --limit 100 & done
```
**Expected Behavior**:
- ⚠️ HTTP 429 response
- ⚠️ Error message: `API request failed (page 1): 429 - Too Many Requests`
- ⚠️ Script exits with code 1
- ⚠️ Should implement retry logic with exponential backoff (future enhancement)

#### FC-9: Network Error (No Connection)
**Description**: Network is down or API server unreachable
**Input**:
```bash
# Disconnect network or use invalid URL:
yarn crawl --api-url "https://invalid-domain-that-does-not-exist.com/api"
```
**Expected Behavior**:
- ❌ Network error (ECONNREFUSED, ENOTFOUND, etc.)
- ❌ Error message includes network error details
- ❌ Script exits with code 1
- ❌ Error handling should catch `fetch` errors gracefully

#### FC-10: API Returns 500 Internal Server Error
**Description**: Server-side error
**Input**:
```bash
yarn crawl --authorization "Bearer valid_token" --api-key "valid_key"
# (API server returns 500)
```
**Expected Behavior**:
- ❌ HTTP 500 response
- ❌ Error message: `API request failed (page 1): 500 - Internal Server Error`
- ❌ Script exits with code 1

---

### 3. Edge Cases 🔍

#### EC-1: Empty Authorization String
**Description**: Authorization provided but empty string
**Input**:
```bash
yarn crawl --authorization "" --api-key "valid_key"
```
**Expected Behavior**:
- ⚠️ Header set to empty string: `authorization: ""`
- ⚠️ API likely returns 401
- ⚠️ Should handle gracefully

#### EC-2: Empty API Key String
**Description**: API key provided but empty string
**Input**:
```bash
yarn crawl --authorization "Bearer valid_token" --api-key ""
```
**Expected Behavior**:
- ⚠️ Header set to empty string: `x-api-key: ""`
- ⚠️ API likely returns 401/403
- ⚠️ Should handle gracefully

#### EC-3: Whitespace-Only Authorization
**Description**: Authorization contains only whitespace
**Input**:
```bash
yarn crawl --authorization "   " --api-key "valid_key"
```
**Expected Behavior**:
- ⚠️ Header includes whitespace
- ⚠️ API likely rejects (401)
- ⚠️ Should trim or validate (future enhancement)

#### EC-4: Malformed Authorization Token (Not "Bearer ...")
**Description**: Authorization doesn't follow "Bearer <token>" format
**Input**:
```bash
yarn crawl --authorization "InvalidFormatToken" --api-key "valid_key"
```
**Expected Behavior**:
- ⚠️ Header sent as-is: `authorization: InvalidFormatToken`
- ⚠️ API likely returns 401 (if it expects "Bearer" prefix)
- ⚠️ Should validate format (future enhancement)

#### EC-5: Authorization Token with Special Characters
**Description**: Token contains URL-unsafe or special characters
**Input**:
```bash
yarn crawl --authorization "Bearer token+with/special=chars&more" --api-key "valid_key"
```
**Expected Behavior**:
- ✅ Token sent as-is (HTTP headers handle special chars)
- ✅ API accepts if token is valid
- ✅ Should work correctly

#### EC-6: API Key with Special Characters
**Description**: API key contains special characters
**Input**:
```bash
yarn crawl --authorization "Bearer valid_token" --api-key "key+with/special=chars"
```
**Expected Behavior**:
- ✅ Key sent as-is
- ✅ API accepts if key is valid
- ✅ Should work correctly

#### EC-7: Very Long Authorization Token
**Description**: Token exceeds typical length (e.g., 10KB)
**Input**:
```bash
yarn crawl --authorization "Bearer $(python3 -c 'print("A" * 10000)')" --api-key "valid_key"
```
**Expected Behavior**:
- ⚠️ May hit HTTP header size limits
- ⚠️ Server may reject (431 Request Header Fields Too Large)
- ⚠️ Should handle gracefully

#### EC-8: Very Long API Key
**Description**: API key is extremely long
**Input**:
```bash
yarn crawl --authorization "Bearer valid_token" --api-key "$(python3 -c 'print("K" * 10000)')"
```
**Expected Behavior**:
- ⚠️ May hit HTTP header size limits
- ⚠️ Server may reject (431)
- ⚠️ Should handle gracefully

#### EC-9: Authorization Token with Newlines
**Description**: Token contains newline characters
**Input**:
```bash
yarn crawl --authorization "Bearer token\nwith\nnewlines" --api-key "valid_key"
```
**Expected Behavior**:
- ⚠️ HTTP headers typically strip/escape newlines
- ⚠️ May cause malformed request
- ⚠️ Should sanitize input (future enhancement)

#### EC-10: Environment Variable Precedence (Both Set)
**Description**: Both CRAWL_AUTHORIZATION and CRAWL_API_KEY set, but CLI args also provided
**Input**:
```bash
CRAWL_AUTHORIZATION="Bearer env_token" CRAWL_API_KEY="env_key" \
yarn crawl --authorization "Bearer cli_token"
```
**Expected Behavior**:
- ✅ CLI `--authorization` overrides `CRAWL_AUTHORIZATION`
- ✅ `CRAWL_API_KEY` env var is used (no CLI override for API key)
- ✅ Final headers: `authorization: Bearer cli_token`, `x-api-key: env_key`

#### EC-11: Environment Variable Precedence (Only Env Set)
**Description**: Only environment variables set, no CLI args
**Input**:
```bash
CRAWL_AUTHORIZATION="Bearer env_token" CRAWL_API_KEY="env_key" yarn crawl
```
**Expected Behavior**:
- ✅ Both headers use env vars
- ✅ API request succeeds

#### EC-12: Default Headers Override (When No CLI/Env)
**Description**: No CLI args or env vars, use DEFAULT_HEADERS
**Input**:
```bash
# Unset env vars:
unset CRAWL_AUTHORIZATION CRAWL_API_KEY
yarn crawl
```
**Expected Behavior**:
- ✅ Headers use values from `DEFAULT_HEADERS` constant
- ✅ API request succeeds

#### EC-13: Authorization Token Expires Mid-Request
**Description**: Token expires during pagination (between page requests)
**Input**:
```bash
# Use token that expires in 1 second, fetch multiple pages:
yarn crawl --max-pages 5 --authorization "Bearer short_lived_token"
```
**Expected Behavior**:
- ⚠️ First page succeeds
- ⚠️ Subsequent pages fail with 401
- ⚠️ Error message indicates which page failed
- ⚠️ Should implement token refresh (future enhancement)

#### EC-14: API Key Rotated Mid-Request
**Description**: API key is rotated/revoked during execution
**Input**:
```bash
# Start crawl, then rotate key on server:
yarn crawl --max-pages 10 --api-key "key_that_gets_rotated"
```
**Expected Behavior**:
- ⚠️ Initial pages succeed
- ⚠️ Later pages fail with 401/403
- ⚠️ Error message indicates which page failed

#### EC-15: Mixed Case in Header Names
**Description**: CLI args use different case (should be normalized)
**Input**:
```bash
# Note: This is not possible with current implementation, but test if header names are case-sensitive
```
**Expected Behavior**:
- ✅ HTTP headers are case-insensitive
- ✅ Should work regardless of case in code

#### EC-16: Authorization Token with Unicode Characters
**Description**: Token contains non-ASCII characters
**Input**:
```bash
yarn crawl --authorization "Bearer token_with_émojis_🚀" --api-key "valid_key"
```
**Expected Behavior**:
- ⚠️ May cause encoding issues
- ⚠️ Should URL-encode or validate (future enhancement)

#### EC-17: Concurrent Requests with Same Token
**Description**: Multiple crawler instances using same token simultaneously
**Input**:
```bash
# Run two instances:
yarn crawl --max-pages 2 &
yarn crawl --max-pages 2 &
```
**Expected Behavior**:
- ⚠️ Both may succeed if API allows concurrent requests
- ⚠️ OR one/both may get rate limited (429)
- ⚠️ Should handle rate limiting gracefully

#### EC-18: Authorization Token in URL (Should Not Happen)
**Description**: Token accidentally included in API URL query string
**Input**:
```bash
yarn crawl --api-url "https://api.example.com/listings?token=secret"
```
**Expected Behavior**:
- ⚠️ Token exposed in URL (security risk)
- ⚠️ Should validate and warn (future enhancement)
- ⚠️ Headers should still be used (not URL params)

---

## Test Implementation Notes

### Current Implementation Behavior
- ✅ CLI arguments (`--authorization`, `--api-key`) take precedence over environment variables
- ✅ Environment variables (`CRAWL_AUTHORIZATION`, `CRAWL_API_KEY`) take precedence over defaults
- ✅ Default headers (`DEFAULT_HEADERS`) are used as fallback
- ✅ Headers are merged: `{...DEFAULT_HEADERS, ...env, ...cli}`
- ⚠️ No input validation for token format
- ⚠️ No retry logic for 429 rate limits
- ⚠️ No token refresh mechanism
- ⚠️ Errors cause immediate exit (no partial recovery)

### Recommended Enhancements
1. **Input Validation**: Validate token format (e.g., "Bearer <token>")
2. **Retry Logic**: Implement exponential backoff for 429/500/503 errors
3. **Token Refresh**: Support token refresh for expired tokens
4. **Sanitization**: Trim whitespace, validate length, escape special chars
5. **Security**: Warn if credentials appear in URLs or logs
6. **Graceful Degradation**: Continue with available credentials if one is missing (if API allows)

### Test Execution
To implement these tests:
1. Install Jest: `yarn add -D jest @types/jest ts-jest`
2. Create `scripts/crawl.test.ts` (see template below)
3. Mock `fetch` API for controlled testing
4. Run: `yarn test scripts/crawl.test.ts`
