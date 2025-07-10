import axios, { AxiosInstance, AxiosError } from 'axios';
import { ConfluenceAuth } from './auth.js';
import { Config, configManager } from '../config/index.js';
import { 
  ConfluencePage, 
  ConfluenceSpace, 
  ConfluenceSearchResult,
  ConfluenceAttachment,
  ConfluenceUser
} from './types.js';
import { AuthenticationError, TokenExpiredError, ConfluenceAPIError, RateLimitError } from '../utils/errors.js';

export class ConfluenceClient {
  private client!: AxiosInstance;
  private auth: ConfluenceAuth;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.auth = new ConfluenceAuth(config);
    this.initializeClient();
  }

  private initializeClient() {
    this.client = axios.create({
      baseURL: `${this.auth.getBaseUrl()}/wiki/rest/api`,
      headers: this.auth.getAuthHeaders(),
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Rate limiting interceptor
    this.setupRateLimiting();
    
    // Error handling interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          console.log('🔐 Authentication error detected. Token may have expired.');
          
          try {
            await configManager.requestTokenRenewal();
            // Update client with new configuration
            this.config = configManager.getConfig();
            this.auth = new ConfluenceAuth(this.config);
            this.initializeClient();
            
            // Retry original request
            return this.client.request(error.config!);
          } catch (renewalError) {
            throw new TokenExpiredError('Token renewal failed');
          }
        }
        
        if (error.response?.status === 403) {
          throw new AuthenticationError('Access denied. Check your permissions.');
        }
        
        if (error.response?.status === 429) {
          throw new RateLimitError('Rate limit exceeded. Please wait a moment.');
        }
        
        throw new ConfluenceAPIError(
          error.message,
          error.response?.status,
          error.response?.data
        );
      }
    );
  }

  private setupRateLimiting() {
    let requestCount = 0;
    let windowStart = Date.now();

    this.client.interceptors.request.use((axiosConfig) => {
      const now = Date.now();
      if (now - windowStart > this.config.rateLimitWindowMs) {
        requestCount = 0;
        windowStart = now;
      }

      if (requestCount >= this.config.rateLimitRequests) {
        throw new RateLimitError('Client-side rate limit exceeded');
      }

      requestCount++;
      return axiosConfig;
    });
  }

  async updateConfig(newConfig: Config): Promise<void> {
    this.config = newConfig;
    this.auth = new ConfluenceAuth(newConfig);
    this.initializeClient();
  }

  async getCurrentUser(): Promise<ConfluenceUser> {
    const response = await this.client.get('/user/current');
    return response.data;
  }

  async getPage(pageId: string, expand?: string[]): Promise<ConfluencePage> {
    const response = await this.client.get(`/content/${pageId}`, {
      params: {
        expand: expand?.join(',') || 'body.storage,version,space',
      },
    });
    return response.data;
  }

  async getSpace(spaceKey: string): Promise<ConfluenceSpace> {
    const response = await this.client.get(`/space/${spaceKey}`);
    return response.data;
  }

  async searchContent(cql: string, limit = 25, cursor?: string): Promise<ConfluenceSearchResult> {
    const response = await this.client.get('/content/search', {
      params: {
        cql,
        limit,
        cursor,
      },
    });
    return response.data;
  }

  async getSpaces(limit = 25, cursor?: string): Promise<{ results: ConfluenceSpace[]; _links: any }> {
    const response = await this.client.get('/space', {
      params: {
        limit,
        cursor,
      },
    });
    return response.data;
  }

  async getAttachment(attachmentId: string): Promise<ConfluenceAttachment> {
    const response = await this.client.get(`/content/${attachmentId}`);
    return response.data;
  }

  async getPagesBySpace(spaceKey: string, limit = 25, cursor?: string): Promise<ConfluenceSearchResult> {
    return this.searchContent(`type=page AND space=${spaceKey}`, limit, cursor);
  }

  async getRecentPages(limit = 10): Promise<ConfluenceSearchResult> {
    return this.searchContent('type=page ORDER BY lastModified DESC', limit);
  }

  async searchPages(query: string, limit = 25): Promise<ConfluenceSearchResult> {
    const cql = `type=page AND (title ~ "${query}" OR text ~ "${query}")`;
    return this.searchContent(cql, limit);
  }

  async createPage(spaceKey: string, title: string, content: string, parentId?: string): Promise<ConfluencePage> {
    const pageData = {
      type: 'page',
      title,
      space: {
        key: spaceKey,
      },
      body: {
        storage: {
          value: content,
          representation: 'storage',
        },
      },
      ...(parentId && {
        ancestors: [
          {
            id: parentId,
          },
        ],
      }),
    };

    const response = await this.client.post('/content', pageData);
    return response.data;
  }

  async updatePage(pageId: string, title?: string, content?: string): Promise<ConfluencePage> {
    // Erst die aktuelle Seite abrufen, um die Versionsnummer zu erhalten
    const currentPage = await this.getPage(pageId, ['version']);
    
    const updateData = {
      id: pageId,
      type: 'page',
      version: {
        number: currentPage.version.number + 1,
      },
      ...(title && { title }),
      ...(content && {
        body: {
          storage: {
            value: content,
            representation: 'storage',
          },
        },
      }),
    };

    const response = await this.client.put(`/content/${pageId}`, updateData);
    return response.data;
  }
}