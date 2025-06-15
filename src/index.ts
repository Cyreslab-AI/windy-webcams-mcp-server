#!/usr/bin/env node

/**
 * Windy Webcam MCP Server v1.0.0
 * 
 * This MCP server provides access to the Windy Webcam Public API which contains:
 * - Live webcam feeds from around the world
 * - Webcam filtering by location, category, and other criteria
 * - Geographic clustering for map display
 * - Detailed webcam information including images, timelapses, and live players
 * - Categories and geographic region data
 * 
 * The Windy Webcam API requires an API key for access.
 * API documentation: https://api.windy.com/webcams/docs
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from 'axios';
import {
  WindyWebcam,
  WindyApiResponse,
  WindyWebcamsResponse,
  WindySingleWebcamResponse,
  WindyMapClustersResponse,
  WindyCategoriesResponse,
  WindyGeoRegionsResponse,
  WindyExportResponse,
  WindyWebcamSearchParams,
  WindyMapClusterParams,
  WindyServerConfig,
  WindyToolResponse,
  CacheEntry
} from './types/windy-types.js';

class WindyWebcamServer {
  private server: Server;
  private axiosInstance: AxiosInstance;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: WindyServerConfig;
  private lastRequestTime: number = 0;

  constructor() {
    this.server = new Server(
      {
        name: "windy-webcam-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Configuration
    this.config = {
      apiKey: process.env.WINDY_API_KEY || '',
      baseUrl: 'https://api.windy.com',
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      cacheTTL: 5 * 60 * 1000, // 5 minutes
      rateLimitDelay: 1000, // 1 second between requests
      userAgent: 'Windy-Webcam-MCP-Server/1.0.0'
    };

    // Validate API key
    if (!this.config.apiKey) {
      console.error('❌ WINDY_API_KEY environment variable is required');
      console.error('💡 Get your free API key at: https://api.windy.com/keys');
      process.exit(1);
    }

    // Initialize HTTP client
    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'x-windy-api-key': this.config.apiKey,
        'User-Agent': this.config.userAgent,
        'Accept': 'application/json',
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });

    // Clean up cache periodically
    setInterval(() => this.cleanupCache(), 60000);
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  private getCachedResponse<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private setCachedResponse<T>(key: string, data: T, ttl?: number) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.cacheTTL
    });
  }

  private async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.config.rateLimitDelay) {
      const waitTime = this.config.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  private async makeWindyRequest<T>(endpoint: string, params: any = {}, useCache = true): Promise<T> {
    const cacheKey = `${endpoint}_${JSON.stringify(params)}`;
    
    // Check cache first
    if (useCache) {
      const cached = this.getCachedResponse<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Rate limiting
    await this.enforceRateLimit();

    let lastError: any;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.get(endpoint, { params });
        const data = response.data;
        
        // Cache the response
        if (useCache) {
          this.setCachedResponse(cacheKey, data);
        }
        
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < this.config.maxRetries && axios.isAxiosError(error) && error.response?.status !== 404) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private formatResponse(data: any, context: string, cached = false): WindyToolResponse {
    return {
      success: true,
      summary: context,
      data,
      cached,
      api_info: {
        cache_hit: cached,
        response_time_ms: Date.now() - this.lastRequestTime
      }
    };
  }

  private formatError(error: string): WindyToolResponse {
    return {
      success: false,
      summary: `Error: ${error}`,
      error
    };
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_webcams',
          description: 'Search for webcams with various filters (location, category, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              country: {
                type: 'string',
                description: 'Country code (e.g., "US", "DE", "FR")',
              },
              region: {
                type: 'string',
                description: 'Region code within a country',
              },
              continent: {
                type: 'string',
                description: 'Continent code (e.g., "NA", "EU", "AS")',
              },
              category: {
                type: 'string',
                description: 'Category ID or comma-separated list of category IDs',
              },
              nearby: {
                type: 'string',
                description: 'Coordinates for nearby search (format: "lat,lng")',
              },
              bbox: {
                type: 'string',
                description: 'Bounding box coordinates (format: "sw_lat,sw_lng,ne_lat,ne_lng")',
              },
              limit: {
                type: 'number',
                description: 'Number of results to return (1-50, default: 10)',
                minimum: 1,
                maximum: 50,
              },
              offset: {
                type: 'number',
                description: 'Result offset for pagination (default: 0)',
                minimum: 0,
              },
              order: {
                type: 'string',
                description: 'Order results by field',
                enum: ['hotness', 'new', 'recent', 'random'],
              },
              lang: {
                type: 'string',
                description: 'Language code (default: "en")',
              },
            },
          },
        },
        {
          name: 'get_webcam',
          description: 'Get detailed information about a specific webcam by ID',
          inputSchema: {
            type: 'object',
            properties: {
              webcam_id: {
                type: 'string',
                description: 'Webcam ID',
              },
              include: {
                type: 'string',
                description: 'Additional data to include (e.g., "player", "location")',
              },
              lang: {
                type: 'string',
                description: 'Language code (default: "en")',
              },
            },
            required: ['webcam_id'],
          },
        },
        {
          name: 'get_webcams_by_location',
          description: 'Get webcams from a specific location (country, region, or continent)',
          inputSchema: {
            type: 'object',
            properties: {
              location_type: {
                type: 'string',
                description: 'Type of location filter',
                enum: ['country', 'region', 'continent'],
              },
              location_code: {
                type: 'string',
                description: 'Location code (country/region/continent code)',
              },
              limit: {
                type: 'number',
                description: 'Number of results to return (1-50, default: 20)',
                minimum: 1,
                maximum: 50,
              },
              order: {
                type: 'string',
                description: 'Order results by field',
                enum: ['hotness', 'new', 'recent', 'random'],
              },
            },
            required: ['location_type', 'location_code'],
          },
        },
        {
          name: 'get_webcams_by_category',
          description: 'Get webcams from specific categories',
          inputSchema: {
            type: 'object',
            properties: {
              categories: {
                type: 'string',
                description: 'Category ID or comma-separated list of category IDs',
              },
              limit: {
                type: 'number',
                description: 'Number of results to return (1-50, default: 20)',
                minimum: 1,
                maximum: 50,
              },
              order: {
                type: 'string',
                description: 'Order results by field',
                enum: ['hotness', 'new', 'recent', 'random'],
              },
            },
            required: ['categories'],
          },
        },
        {
          name: 'get_nearby_webcams',
          description: 'Find webcams near specific coordinates',
          inputSchema: {
            type: 'object',
            properties: {
              latitude: {
                type: 'number',
                description: 'Latitude coordinate',
                minimum: -90,
                maximum: 90,
              },
              longitude: {
                type: 'number',
                description: 'Longitude coordinate',
                minimum: -180,
                maximum: 180,
              },
              radius: {
                type: 'number',
                description: 'Search radius in kilometers (optional)',
                minimum: 1,
                maximum: 250,
              },
              limit: {
                type: 'number',
                description: 'Number of results to return (1-50, default: 10)',
                minimum: 1,
                maximum: 50,
              },
            },
            required: ['latitude', 'longitude'],
          },
        },
        {
          name: 'get_map_clusters',
          description: 'Get webcam clusters optimized for map display',
          inputSchema: {
            type: 'object',
            properties: {
              ne_lat: {
                type: 'number',
                description: 'Northeast corner latitude',
                minimum: -90,
                maximum: 90,
              },
              ne_lng: {
                type: 'number',
                description: 'Northeast corner longitude',
                minimum: -180,
                maximum: 180,
              },
              sw_lat: {
                type: 'number',
                description: 'Southwest corner latitude',
                minimum: -90,
                maximum: 90,
              },
              sw_lng: {
                type: 'number',
                description: 'Southwest corner longitude',
                minimum: -180,
                maximum: 180,
              },
              zoom: {
                type: 'number',
                description: 'Map zoom level (1-18)',
                minimum: 1,
                maximum: 18,
              },
              cluster: {
                type: 'boolean',
                description: 'Enable clustering (default: true)',
              },
            },
            required: ['ne_lat', 'ne_lng', 'sw_lat', 'sw_lng'],
          },
        },
        {
          name: 'get_categories',
          description: 'Get available webcam categories for filtering',
          inputSchema: {
            type: 'object',
            properties: {
              lang: {
                type: 'string',
                description: 'Language code (default: "en")',
              },
            },
          },
        },
        {
          name: 'get_countries',
          description: 'Get available countries with webcams',
          inputSchema: {
            type: 'object',
            properties: {
              lang: {
                type: 'string',
                description: 'Language code (default: "en")',
              },
            },
          },
        },
        {
          name: 'get_regions',
          description: 'Get available regions with webcams',
          inputSchema: {
            type: 'object',
            properties: {
              lang: {
                type: 'string',
                description: 'Language code (default: "en")',
              },
            },
          },
        },
        {
          name: 'get_continents',
          description: 'Get available continents with webcams',
          inputSchema: {
            type: 'object',
            properties: {
              lang: {
                type: 'string',
                description: 'Language code (default: "en")',
              },
            },
          },
        },
        {
          name: 'export_all_webcams',
          description: 'Get basic information about all available webcams',
          inputSchema: {
            type: 'object',
            properties: {
              format: {
                type: 'string',
                description: 'Export format',
                enum: ['json'],
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const startTime = Date.now();
        let result: WindyToolResponse;

        switch (request.params.name) {
          case 'search_webcams':
            result = await this.searchWebcams(request.params.arguments);
            break;
          case 'get_webcam':
            result = await this.getWebcam(request.params.arguments);
            break;
          case 'get_webcams_by_location':
            result = await this.getWebcamsByLocation(request.params.arguments);
            break;
          case 'get_webcams_by_category':
            result = await this.getWebcamsByCategory(request.params.arguments);
            break;
          case 'get_nearby_webcams':
            result = await this.getNearbyWebcams(request.params.arguments);
            break;
          case 'get_map_clusters':
            result = await this.getMapClusters(request.params.arguments);
            break;
          case 'get_categories':
            result = await this.getCategories(request.params.arguments);
            break;
          case 'get_countries':
            result = await this.getCountries(request.params.arguments);
            break;
          case 'get_regions':
            result = await this.getRegions(request.params.arguments);
            break;
          case 'get_continents':
            result = await this.getContinents(request.params.arguments);
            break;
          case 'export_all_webcams':
            result = await this.exportAllWebcams(request.params.arguments);
            break;
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }

        result.api_info = {
          ...result.api_info,
          response_time_ms: Date.now() - startTime
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          const statusCode = error.response?.status;
          const errorMessage = error.response?.data?.message || error.message;
          
          if (statusCode === 401) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(this.formatError('Invalid API key. Please check your Windy API key.'), null, 2)
              }],
              isError: true,
            };
          }
          
          if (statusCode === 429) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(this.formatError('Rate limit exceeded. Please wait and try again.'), null, 2)
              }],
              isError: true,
            };
          }

          if (statusCode === 404) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(this.formatError('Resource not found. Please verify the parameters.'), null, 2)
              }],
              isError: true,
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(this.formatError(`Windy API error (${statusCode}): ${errorMessage}`), null, 2)
            }],
            isError: true,
          };
        }
        
        throw error;
      }
    });
  }

  private async searchWebcams(args: any): Promise<WindyToolResponse> {
    const params: any = {
      limit: Math.min(args.limit || 10, 50),
      offset: args.offset || 0,
    };

    if (args.country) params.country = args.country;
    if (args.region) params.region = args.region;
    if (args.continent) params.continent = args.continent;
    if (args.category) params.category = args.category;
    if (args.nearby) params.nearby = args.nearby;
    if (args.bbox) params.bbox = args.bbox;
    if (args.order) params.order = args.order;

    const cacheKey = `search_webcams_${JSON.stringify(params)}`;
    const cached = this.getCachedResponse<any>(cacheKey);
    
    if (cached) {
      return this.formatResponse(cached, `Found ${cached.total} webcams (${cached.webcams.length} returned)`, true);
    }

    const response = await this.makeWindyRequest<any>('/webcams/api/v3/webcams', params);
    
    return this.formatResponse(response, `Found ${response.total} webcams (${response.webcams.length} returned)`);
  }

  private async getWebcam(args: any): Promise<WindyToolResponse> {
    const webcamId = args.webcam_id;
    if (!webcamId) {
      throw new McpError(ErrorCode.InvalidParams, 'webcam_id is required');
    }

    const params = {
      show: 'webcams:image,location,player,url',
      lang: args.lang || 'en',
      include: args.include || 'location,player'
    };

    const response = await this.makeWindyRequest<WindyApiResponse<WindySingleWebcamResponse>>(`/webcams/api/v3/webcams/${webcamId}`, params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Retrieved webcam details for ${webcamId}`);
  }

  private async getWebcamsByLocation(args: any): Promise<WindyToolResponse> {
    const { location_type, location_code } = args;
    
    if (!location_type || !location_code) {
      throw new McpError(ErrorCode.InvalidParams, 'location_type and location_code are required');
    }

    const params: WindyWebcamSearchParams = {
      show: 'webcams:image,location',
      lang: 'en',
      limit: Math.min(args.limit || 20, 50),
      [location_type]: location_code
    };

    if (args.order) params.order = args.order;

    const response = await this.makeWindyRequest<WindyApiResponse<WindyWebcamsResponse>>('/webcams/api/v3/webcams', params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Found ${response.result.total} webcams in ${location_type} ${location_code}`);
  }

  private async getWebcamsByCategory(args: any): Promise<WindyToolResponse> {
    const categories = args.categories;
    if (!categories) {
      throw new McpError(ErrorCode.InvalidParams, 'categories parameter is required');
    }

    const params: WindyWebcamSearchParams = {
      show: 'webcams:image,location',
      lang: 'en',
      limit: Math.min(args.limit || 20, 50),
      category: categories
    };

    if (args.order) params.order = args.order;

    const response = await this.makeWindyRequest<WindyApiResponse<WindyWebcamsResponse>>('/webcams/api/v3/webcams', params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Found ${response.result.total} webcams in categories: ${categories}`);
  }

  private async getNearbyWebcams(args: any): Promise<WindyToolResponse> {
    const { latitude, longitude } = args;
    
    if (latitude === undefined || longitude === undefined) {
      throw new McpError(ErrorCode.InvalidParams, 'latitude and longitude are required');
    }

    const params: WindyWebcamSearchParams = {
      show: 'webcams:image,location',
      lang: 'en',
      limit: Math.min(args.limit || 10, 50),
      nearby: `${latitude},${longitude}`
    };

    const response = await this.makeWindyRequest<WindyApiResponse<WindyWebcamsResponse>>('/webcams/api/v3/webcams', params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Found ${response.result.total} webcams near ${latitude},${longitude}`);
  }

  private async getMapClusters(args: any): Promise<WindyToolResponse> {
    const { ne_lat, ne_lng, sw_lat, sw_lng } = args;
    
    if (ne_lat === undefined || ne_lng === undefined || sw_lat === undefined || sw_lng === undefined) {
      throw new McpError(ErrorCode.InvalidParams, 'Bounding box coordinates (ne_lat, ne_lng, sw_lat, sw_lng) are required');
    }

    const params: WindyMapClusterParams = {
      ne: `${ne_lat},${ne_lng}`,
      sw: `${sw_lat},${sw_lng}`,
      zoom: args.zoom || 10,
      cluster: args.cluster !== false,
      limit: args.limit || 100,
      include: 'webcams:image,location'
    };

    const response = await this.makeWindyRequest<WindyApiResponse<WindyMapClustersResponse>>('/webcams/api/v3/map/clusters', params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Retrieved ${response.result.clusters.length} webcam clusters for map display`);
  }

  private async getCategories(args: any): Promise<WindyToolResponse> {
    const params = {
      lang: args.lang || 'en'
    };

    const response = await this.makeWindyRequest<WindyApiResponse<WindyCategoriesResponse>>('/webcams/api/v3/categories', params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Retrieved ${response.result.categories.length} available categories`);
  }

  private async getCountries(args: any): Promise<WindyToolResponse> {
    const params = {
      lang: args.lang || 'en'
    };

    const response = await this.makeWindyRequest<WindyApiResponse<WindyGeoRegionsResponse>>('/webcams/api/v3/countries', params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Retrieved ${response.result.countries?.length || 0} available countries`);
  }

  private async getRegions(args: any): Promise<WindyToolResponse> {
    const params = {
      lang: args.lang || 'en'
    };

    const response = await this.makeWindyRequest<WindyApiResponse<WindyGeoRegionsResponse>>('/webcams/api/v3/regions', params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Retrieved ${response.result.regions?.length || 0} available regions`);
  }

  private async getContinents(args: any): Promise<WindyToolResponse> {
    const params = {
      lang: args.lang || 'en'
    };

    const response = await this.makeWindyRequest<WindyApiResponse<WindyGeoRegionsResponse>>('/webcams/api/v3/continents', params);
    
    if (response.status !== 'OK') {
      throw new Error(`API returned status: ${response.status}`);
    }

    return this.formatResponse(response.result, `Retrieved ${response.result.continents?.length || 0} available continents`);
  }

  private async exportAllWebcams(args: any): Promise<WindyToolResponse> {
    const response = await this.makeWindyRequest<WindyExportResponse>('/webcams/export/all-webcams.json', {}, false); // Don't cache this large response
    
    return this.formatResponse(response, `Exported ${response.webcams.length} webcams with basic information`);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Windy Webcam MCP server v1.0.0 running on stdio');
  }
}

const server = new WindyWebcamServer();
server.run().catch(console.error);
