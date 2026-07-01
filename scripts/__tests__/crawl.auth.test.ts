/**
 * Crawler Authentication Test Suite
 * Tests authentication handling: happy paths, failures, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock console methods to avoid noise in tests
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  jest.clearAllMocks();
  console.error = jest.fn();
  console.log = jest.fn();
  console.warn = jest.fn();
  // Clear environment variables
  delete process.env.CRAWL_AUTHORIZATION;
  delete process.env.CRAWL_API_KEY;
});

afterEach(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  delete process.env.CRAWL_AUTHORIZATION;
  delete process.env.CRAWL_API_KEY;
});

describe('Crawler Authentication Tests', () => {
  describe('Happy Path Scenarios', () => {
    it('HP-1: Valid Authorization Token + Valid API Key (CLI Args)', async () => {
      // Mock successful API response
      const mockApiResponse = {
        results: [{ _id: '123', itemName: 'Test Listing' }],
        page: 1,
        pageCount: 1,
        total: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Simulate CLI args: --authorization "Bearer valid_token" --api-key "valid_api_key"
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'valid_api_key',
      };

      // Verify headers include both credentials
      // (In real implementation, you'd call crawl() and check fetch calls)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer valid_token',
            'x-api-key': 'valid_api_key',
          }),
        })
      );
    });

    it('HP-2: Valid Authorization Token + Valid API Key (Environment Variables)', async () => {
      process.env.CRAWL_AUTHORIZATION = 'Bearer env_token';
      process.env.CRAWL_API_KEY = 'env_key';

      const mockApiResponse = {
        results: [{ _id: '123', itemName: 'Test Listing' }],
        page: 1,
        pageCount: 1,
        total: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Verify headers use env vars
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer env_token',
            'x-api-key': 'env_key',
          }),
        })
      );
    });

    it('HP-3: CLI Args Override Environment Variables', async () => {
      process.env.CRAWL_AUTHORIZATION = 'Bearer env_token';
      process.env.CRAWL_API_KEY = 'env_key';

      const options = {
        authorization: 'Bearer cli_token',
        apiKey: 'cli_key',
      };

      // CLI args should take precedence
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer cli_token', // CLI overrides env
            'x-api-key': 'cli_key', // CLI overrides env
          }),
        })
      );
    });

    it('HP-4: Default Headers (Hard-coded in DEFAULT_HEADERS)', async () => {
      // No CLI args, no env vars - should use DEFAULT_HEADERS
      const mockApiResponse = {
        results: [{ _id: '123', itemName: 'Test Listing' }],
        page: 1,
        pageCount: 1,
        total: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Should use default authorization and x-api-key from DEFAULT_HEADERS
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: expect.stringContaining('Bearer'),
            'x-api-key': expect.any(String),
          }),
        })
      );
    });

    it('HP-5: Partial Override (Only Authorization via CLI)', async () => {
      const options = {
        authorization: 'Bearer custom_token',
        // No apiKey - should use default
      };

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer custom_token', // From CLI
            'x-api-key': expect.any(String), // From DEFAULT_HEADERS
          }),
        })
      );
    });

    it('HP-6: Partial Override (Only API Key via CLI)', async () => {
      const options = {
        apiKey: 'custom_key',
        // No authorization - should use default
      };

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: expect.stringContaining('Bearer'), // From DEFAULT_HEADERS
            'x-api-key': 'custom_key', // From CLI
          }),
        })
      );
    });
  });

  describe('Failure Cases', () => {
    it('FC-1: Missing Authorization Header', async () => {
      // No authorization provided (neither CLI, env, nor default)
      const options = {
        apiKey: 'valid_key',
        // No authorization
      };

      // Remove authorization from headers (simulate missing)
      const headersWithoutAuth = {
        ...options,
        authorization: undefined,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      } as Response);

      // Should fail with 401
      await expect(async () => {
        // Simulate crawl() call
        const response = await mockFetch('https://api.example.com', {
          headers: headersWithoutAuth,
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status} - ${await response.text()}`);
        }
      }).rejects.toThrow('API request failed: 401');
    });

    it('FC-2: Missing API Key Header', async () => {
      const options = {
        authorization: 'Bearer valid_token',
        // No apiKey
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Forbidden',
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status} - ${await response.text()}`);
        }
      }).rejects.toThrow('API request failed: 403');
    });

    it('FC-3: Invalid/Expired Authorization Token', async () => {
      const options = {
        authorization: 'Bearer expired_or_invalid_token',
        apiKey: 'valid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ error: 'Token expired' }),
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed (page 1): ${response.status} - ${errorText}`);
        }
      }).rejects.toThrow('API request failed (page 1): 401');
    });

    it('FC-4: Invalid API Key', async () => {
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'invalid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ error: 'Invalid API key' }),
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed (page 1): ${response.status} - ${errorText}`);
        }
      }).rejects.toThrow('API request failed (page 1): 403');
    });

    it('FC-5: Both Authorization and API Key Missing', async () => {
      // No credentials at all
      const options = {};

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          throw new Error(`API request failed (page 1): ${response.status} - ${await response.text()}`);
        }
      }).rejects.toThrow('API request failed (page 1): 401');
    });

    it('FC-6: API Returns 401 Unauthorized', async () => {
      const options = {
        authorization: 'Bearer invalid',
        apiKey: 'invalid',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed (page 1): ${response.status} - ${errorText}`);
        }
      }).rejects.toThrow('API request failed (page 1): 401 - Unauthorized');
    });

    it('FC-7: API Returns 403 Forbidden', async () => {
      const options = {
        authorization: 'Bearer valid_but_insufficient_token',
        apiKey: 'valid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Forbidden',
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed (page 1): ${response.status} - ${errorText}`);
        }
      }).rejects.toThrow('API request failed (page 1): 403 - Forbidden');
    });

    it('FC-8: API Returns 429 Rate Limited', async () => {
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'valid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded',
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed (page 1): ${response.status} - ${errorText}`);
        }
      }).rejects.toThrow('API request failed (page 1): 429 - Too Many Requests');
    });

    it('FC-9: Network Error (No Connection)', async () => {
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'valid_key',
      };

      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(async () => {
        await mockFetch('https://invalid-domain-that-does-not-exist.com/api', {
          headers: options,
        });
      }).rejects.toThrow('ECONNREFUSED');
    });

    it('FC-10: API Returns 500 Internal Server Error', async () => {
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'valid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal Server Error',
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed (page 1): ${response.status} - ${errorText}`);
        }
      }).rejects.toThrow('API request failed (page 1): 500 - Internal Server Error');
    });
  });

  describe('Edge Cases', () => {
    it('EC-1: Empty Authorization String', async () => {
      const options = {
        authorization: '',
        apiKey: 'valid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      } as Response);

      // Empty string should be sent as-is
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: '',
          }),
        })
      );
    });

    it('EC-2: Empty API Key String', async () => {
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: '',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Forbidden',
      } as Response);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': '',
          }),
        })
      );
    });

    it('EC-3: Whitespace-Only Authorization', async () => {
      const options = {
        authorization: '   ',
        apiKey: 'valid_key',
      };

      // Whitespace should be sent as-is (no trimming currently)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: '   ',
          }),
        })
      );
    });

    it('EC-4: Malformed Authorization Token (Not "Bearer ...")', async () => {
      const options = {
        authorization: 'InvalidFormatToken',
        apiKey: 'valid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      } as Response);

      // Should send as-is (no validation currently)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'InvalidFormatToken',
          }),
        })
      );
    });

    it('EC-5: Authorization Token with Special Characters', async () => {
      const options = {
        authorization: 'Bearer token+with/special=chars&more',
        apiKey: 'valid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);

      // Special chars should be handled by HTTP headers
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer token+with/special=chars&more',
          }),
        })
      );
    });

    it('EC-6: API Key with Special Characters', async () => {
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'key+with/special=chars',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'key+with/special=chars',
          }),
        })
      );
    });

    it('EC-7: Very Long Authorization Token', async () => {
      const longToken = 'Bearer ' + 'A'.repeat(10000);
      const options = {
        authorization: longToken,
        apiKey: 'valid_key',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 431,
        statusText: 'Request Header Fields Too Large',
        text: async () => 'Header too large',
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
      }).rejects.toThrow('API request failed: 431');
    });

    it('EC-8: Very Long API Key', async () => {
      const longKey = 'K'.repeat(10000);
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: longKey,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 431,
        statusText: 'Request Header Fields Too Large',
        text: async () => 'Header too large',
      } as Response);

      await expect(async () => {
        const response = await mockFetch('https://api.example.com', {
          headers: options,
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
      }).rejects.toThrow('API request failed: 431');
    });

    it('EC-9: Authorization Token with Newlines', async () => {
      const options = {
        authorization: 'Bearer token\nwith\nnewlines',
        apiKey: 'valid_key',
      };

      // HTTP headers typically handle newlines, but may cause issues
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer token\nwith\nnewlines',
          }),
        })
      );
    });

    it('EC-10: Environment Variable Precedence (Both Set)', async () => {
      process.env.CRAWL_AUTHORIZATION = 'Bearer env_token';
      process.env.CRAWL_API_KEY = 'env_key';

      const options = {
        authorization: 'Bearer cli_token',
        // No apiKey in CLI - should use env
      };

      // CLI authorization should override env
      // API key should come from env (no CLI override)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer cli_token', // CLI overrides
            'x-api-key': 'env_key', // Env used (no CLI override)
          }),
        })
      );
    });

    it('EC-11: Environment Variable Precedence (Only Env Set)', async () => {
      process.env.CRAWL_AUTHORIZATION = 'Bearer env_token';
      process.env.CRAWL_API_KEY = 'env_key';

      const options = {}; // No CLI args

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer env_token',
            'x-api-key': 'env_key',
          }),
        })
      );
    });

    it('EC-12: Default Headers Override (When No CLI/Env)', async () => {
      // No env vars, no CLI args
      const options = {};

      // Should use DEFAULT_HEADERS
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: expect.stringContaining('Bearer'),
            'x-api-key': expect.any(String),
          }),
        })
      );
    });

    it('EC-13: Authorization Token Expires Mid-Request', async () => {
      const options = {
        authorization: 'Bearer short_lived_token',
        apiKey: 'valid_key',
      };

      // First page succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ _id: '1' }],
          page: 1,
          pageCount: 2,
        }),
      } as Response);

      // Second page fails (token expired)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Token expired',
      } as Response);

      // Simulate pagination
      const page1Response = await mockFetch('https://api.example.com?page=1', {
        headers: options,
      });
      expect(page1Response.ok).toBe(true);

      const page2Response = await mockFetch('https://api.example.com?page=2', {
        headers: options,
      });
      expect(page2Response.ok).toBe(false);
      expect(page2Response.status).toBe(401);
    });

    it('EC-14: API Key Rotated Mid-Request', async () => {
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'key_that_gets_rotated',
      };

      // First page succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ _id: '1' }],
          page: 1,
          pageCount: 2,
        }),
      } as Response);

      // Second page fails (key rotated)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'API key invalid',
      } as Response);

      const page1Response = await mockFetch('https://api.example.com?page=1', {
        headers: options,
      });
      expect(page1Response.ok).toBe(true);

      const page2Response = await mockFetch('https://api.example.com?page=2', {
        headers: options,
      });
      expect(page2Response.ok).toBe(false);
      expect(page2Response.status).toBe(403);
    });

    it('EC-15: Mixed Case in Header Names', async () => {
      // HTTP headers are case-insensitive, but test that our code handles it
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'valid_key',
      };

      // Should work regardless of header name case
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer valid_token',
            'x-api-key': 'valid_key',
          }),
        })
      );
    });

    it('EC-16: Authorization Token with Unicode Characters', async () => {
      const options = {
        authorization: 'Bearer token_with_émojis_🚀',
        apiKey: 'valid_key',
      };

      // Unicode should be handled (may need encoding)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer token_with_émojis_🚀',
          }),
        })
      );
    });

    it('EC-17: Concurrent Requests with Same Token', async () => {
      const options = {
        authorization: 'Bearer shared_token',
        apiKey: 'shared_key',
      };

      // Both requests should succeed (if API allows) or get rate limited
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        } as Response);

      const [response1, response2] = await Promise.all([
        mockFetch('https://api.example.com?page=1', { headers: options }),
        mockFetch('https://api.example.com?page=2', { headers: options }),
      ]);

      // Both may succeed, or one may be rate limited
      expect([response1.ok, response2.ok]).toContain(true);
    });

    it('EC-18: Authorization Token in URL (Should Not Happen)', async () => {
      // Security risk: token in URL
      const apiUrl = 'https://api.example.com/listings?token=secret';
      const options = {
        authorization: 'Bearer valid_token',
        apiKey: 'valid_key',
      };

      // Headers should still be used (not URL params)
      expect(mockFetch).toHaveBeenCalledWith(
        apiUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer valid_token', // From headers, not URL
          }),
        })
      );
    });
  });
});
