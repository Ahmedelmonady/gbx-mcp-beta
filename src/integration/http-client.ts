/** HTTP client for Gameball API with auth header injection and error formatting */

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  secretKey?: string;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
  requiresSecretKey?: boolean;
}

export class GameballClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey?: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
  }

  /** Sends an HTTP request to the Gameball API and returns the response as formatted text */
  async request(options: RequestOptions): Promise<string> {
    if (!this.apiKey) {
      return 'Error: GAMEBALL_API_KEY environment variable is not set.';
    }

    if (options.requiresSecretKey && !this.secretKey) {
      return 'Error: This endpoint requires GAMEBALL_SECRET_KEY which is not configured.';
    }

    let resolvedPath = options.path;
    if (options.pathParams) {
      for (const [key, value] of Object.entries(options.pathParams)) {
        resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    const url = new URL(`${this.baseUrl}${resolvedPath}`);
    if (options.queryParams) {
      for (const [key, value] of Object.entries(options.queryParams)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(key, item);
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'APIKey': this.apiKey,
      'Content-Type': 'application/json',
    };

    if (options.requiresSecretKey && this.secretKey) {
      headers['SecretKey'] = this.secretKey;
    }

    try {
      const fetchOptions: RequestInit = {
        method: options.method,
        headers,
      };

      if (options.body !== undefined && options.method !== 'GET') {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(url.toString(), fetchOptions);
      const text = await response.text();

      if (!response.ok) {
        let errorDetail = text;
        try {
          const parsed = JSON.parse(text);
          errorDetail = JSON.stringify(parsed, null, 2);
        } catch {
          // Use raw text if not JSON
        }
        return `Error (${response.status}): ${response.statusText}\n${errorDetail}`;
      }

      if (!text) {
        return `Success (${response.status}): No content`;
      }

      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed);
      } catch {
        return text;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: Failed to connect to Gameball API: ${message}`;
    }
  }
}
