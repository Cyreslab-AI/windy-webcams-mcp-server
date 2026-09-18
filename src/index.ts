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

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Server, ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import axios, { AxiosInstance } from 'axios';
import {
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
    this.server.setRequestHandler('tools/list', async (): Promise<any> => ({
      tools: [
        {
          name: 'search_webcams',
          description: 'Search for webcams with various filters (location, category, etc.)',
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
          inputSchema: {
            type: 'object',
            properties: {
              countries: {
                type: 'string',
                description: 'Country geo code or comma-separated list of country geo codes (e.g., "US,DE,FR"), max 10. Codes come from get_countries.',
              },
              regions: {
                type: 'string',
                description: 'Region geo code or comma-separated list of region geo codes, max 10. Codes come from get_regions.',
              },
              continents: {
                type: 'string',
                description: 'Continent geo code or comma-separated list of continent geo codes (e.g., "NA,EU,AS"), max 2. Codes come from get_continents.',
              },
              cities: {
                type: 'string',
                description: 'City geo code or comma-separated list of city geo codes.',
              },
              categories: {
                type: 'string',
                description: 'Category ID or comma-separated list of category IDs, max 10. One of: airport, beach, building, city, coast, forest, indoor, lake, landscape, meteo, mountain, observatory, port, river, sportArea, square, traffic, village.',
              },
              categoryOperation: {
                type: 'string',
                description: 'Operator used to combine multiple "categories" (requires categories to be set, default: "and")',
                enum: ['and', 'or'],
              },
              webcamIds: {
                type: 'string',
                description: 'Webcam ID or comma-separated list of webcam IDs to fetch directly (max 50). If set, all other filters are ignored — use this for batch webcam lookups.',
              },
              nearby: {
                type: 'string',
                description: 'Coordinates and radius for nearby search (format: "latitude,longitude,radiusKm", radius max 250)',
              },
              bbox: {
                type: 'string',
                description: 'Bounding box coordinates (format: "north_lat,east_lon,south_lat,west_lon")',
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
              sortKey: {
                type: 'string',
                description: 'Field to sort results by',
                enum: ['popularity', 'createdOn'],
              },
              sortDirection: {
                type: 'string',
                description: 'Sort direction (used with sortKey)',
                enum: ['asc', 'desc'],
              },
              include: {
                type: 'string',
                description: 'Comma-separated list of extra data to include (default: "images,location"). One or more of: categories, images, location, player, urls.',
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
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
          inputSchema: {
            type: 'object',
            properties: {
              webcam_id: {
                type: 'string',
                description: 'Webcam ID',
              },
              include: {
                type: 'string',
                description: 'Comma-separated list of extra data to include (default: "images,location,player,urls"). One or more of: categories, images, location, player, urls.',
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
          description: 'Get webcams from a specific location (country, region, continent, or city)',
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
          inputSchema: {
            type: 'object',
            properties: {
              location_type: {
                type: 'string',
                description: 'Type of location filter',
                enum: ['country', 'region', 'continent', 'city'],
              },
              location_code: {
                type: 'string',
                description: 'Location geo code (country/region/continent/city code)',
              },
              limit: {
                type: 'number',
                description: 'Number of results to return (1-50, default: 20)',
                minimum: 1,
                maximum: 50,
              },
              sortKey: {
                type: 'string',
                description: 'Field to sort results by',
                enum: ['popularity', 'createdOn'],
              },
              sortDirection: {
                type: 'string',
                description: 'Sort direction (used with sortKey)',
                enum: ['asc', 'desc'],
              },
              include: {
                type: 'string',
                description: 'Comma-separated list of extra data to include (default: "images,location"). One or more of: categories, images, location, player, urls.',
              },
            },
            required: ['location_type', 'location_code'],
          },
        },
        {
          name: 'get_webcams_by_category',
          description: 'Get webcams from specific categories',
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
          inputSchema: {
            type: 'object',
            properties: {
              categories: {
                type: 'string',
                description: 'Category ID or comma-separated list of category IDs, max 10',
              },
              categoryOperation: {
                type: 'string',
                description: 'Operator used to combine multiple categories (default: "and")',
                enum: ['and', 'or'],
              },
              limit: {
                type: 'number',
                description: 'Number of results to return (1-50, default: 20)',
                minimum: 1,
                maximum: 50,
              },
              sortKey: {
                type: 'string',
                description: 'Field to sort results by',
                enum: ['popularity', 'createdOn'],
              },
              sortDirection: {
                type: 'string',
                description: 'Sort direction (used with sortKey)',
                enum: ['asc', 'desc'],
              },
              include: {
                type: 'string',
                description: 'Comma-separated list of extra data to include (default: "images,location"). One or more of: categories, images, location, player, urls.',
              },
            },
            required: ['categories'],
          },
        },
        {
          name: 'get_nearby_webcams',
          description: 'Find webcams near specific coordinates',
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
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
                description: 'Search radius in kilometers (default: 50, max: 250)',
                minimum: 1,
                maximum: 250,
              },
              limit: {
                type: 'number',
                description: 'Number of results to return (1-50, default: 10)',
                minimum: 1,
                maximum: 50,
              },
              include: {
                type: 'string',
                description: 'Comma-separated list of extra data to include (default: "images,location"). One or more of: categories, images, location, player, urls.',
              },
            },
            required: ['latitude', 'longitude'],
          },
        },
        {
          name: 'get_map_clusters',
          description: 'Get webcam clusters optimized for map display',
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
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
                description: 'Map zoom level (4-18, default: 10)',
                minimum: 4,
                maximum: 18,
              },
              include: {
                type: 'string',
                description: 'Comma-separated list of extra data to include (default: "images,location"). One or more of: categories, images, location, player, urls.',
              },
            },
            required: ['ne_lat', 'ne_lng', 'sw_lat', 'sw_lng'],
          },
        },
        {
          name: 'get_categories',
          description: 'Get available webcam categories for filtering',
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
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
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
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
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
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
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
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
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
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

    this.server.setRequestHandler('tools/call', async (request) => {
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
            throw new ProtocolError(
              ProtocolErrorCode.MethodNotFound,
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

  // Maps the tool-facing `location_type` value to the v3 query parameter
  // name that carries it. v3 renamed all of these to their plural form.
  private static readonly LOCATION_PARAM_MAP: Record<string, keyof WindyWebcamSearchParams> = {
    country: 'countries',
    region: 'regions',
    continent: 'continents',
    city: 'cities',
  };

  private async searchWebcams(args: any): Promise<WindyToolResponse> {
    const params: WindyWebcamSearchParams = {
      limit: Math.min(args.limit || 10, 50),
      offset: args.offset || 0,
      // Default to images+location so results are useful out of the box,
      // matching the other webcam-list tools instead of coming back bare.
      include: args.include || 'images,location',
    };

    if (args.lang) params.lang = args.lang;
    if (args.countries) params.countries = args.countries;
    if (args.regions) params.regions = args.regions;
    if (args.continents) params.continents = args.continents;
    if (args.cities) params.cities = args.cities;
    if (args.categories) params.categories = args.categories;
    if (args.categoryOperation) params.categoryOperation = args.categoryOperation;
    // Batch lookup by id: bypasses all other filters per the v3 contract.
    if (args.webcamIds) params.webcamIds = args.webcamIds;
    if (args.nearby) params.nearby = args.nearby;
    if (args.bbox) params.bbox = args.bbox;
    if (args.sortKey) params.sortKey = args.sortKey;
    if (args.sortDirection) params.sortDirection = args.sortDirection;

    const response = await this.makeWindyRequest<WindyWebcamsResponse>('/webcams/api/v3/webcams', params);

    return this.formatResponse(response, `Found ${response.total} webcams (${response.webcams.length} returned)`);
  }

  private async getWebcam(args: any): Promise<WindyToolResponse> {
    const webcamId = args.webcam_id;
    if (!webcamId) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'webcam_id is required');
    }

    const params: WindyWebcamSearchParams = {
      lang: args.lang || 'en',
      // v3 only understands `include` — the retired `show` param is no
      // longer sent (previously both were sent together, which is invalid).
      include: args.include || 'images,location,player,urls',
    };

    const webcam = await this.makeWindyRequest<WindySingleWebcamResponse>(`/webcams/api/v3/webcams/${webcamId}`, params);

    return this.formatResponse(webcam, `Retrieved webcam details for ${webcamId}`);
  }

  private async getWebcamsByLocation(args: any): Promise<WindyToolResponse> {
    const { location_type, location_code } = args;

    if (!location_type || !location_code) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'location_type and location_code are required');
    }

    const paramName = WindyWebcamServer.LOCATION_PARAM_MAP[location_type];
    if (!paramName) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Invalid location_type: ${location_type}. Expected one of: country, region, continent, city`
      );
    }

    const params: WindyWebcamSearchParams = {
      lang: 'en',
      limit: Math.min(args.limit || 20, 50),
      include: args.include || 'images,location',
      [paramName]: location_code,
    };

    if (args.sortKey) params.sortKey = args.sortKey;
    if (args.sortDirection) params.sortDirection = args.sortDirection;

    const response = await this.makeWindyRequest<WindyWebcamsResponse>('/webcams/api/v3/webcams', params);

    return this.formatResponse(response, `Found ${response.total} webcams in ${location_type} ${location_code}`);
  }

  private async getWebcamsByCategory(args: any): Promise<WindyToolResponse> {
    const categories = args.categories;
    if (!categories) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'categories parameter is required');
    }

    const params: WindyWebcamSearchParams = {
      lang: 'en',
      limit: Math.min(args.limit || 20, 50),
      include: args.include || 'images,location',
      categories,
    };

    if (args.categoryOperation) params.categoryOperation = args.categoryOperation;
    if (args.sortKey) params.sortKey = args.sortKey;
    if (args.sortDirection) params.sortDirection = args.sortDirection;

    const response = await this.makeWindyRequest<WindyWebcamsResponse>('/webcams/api/v3/webcams', params);

    return this.formatResponse(response, `Found ${response.total} webcams in categories: ${categories}`);
  }

  private async getNearbyWebcams(args: any): Promise<WindyToolResponse> {
    const { latitude, longitude } = args;

    if (latitude === undefined || longitude === undefined) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'latitude and longitude are required');
    }

    // The v3 `nearby` format is "latitude,longitude,radiusKm" — the radius
    // is a required third component, so a sensible default is applied when
    // the caller does not specify one.
    const radius = args.radius || 50;

    const params: WindyWebcamSearchParams = {
      lang: 'en',
      limit: Math.min(args.limit || 10, 50),
      include: args.include || 'images,location',
      nearby: `${latitude},${longitude},${radius}`,
    };

    const response = await this.makeWindyRequest<WindyWebcamsResponse>('/webcams/api/v3/webcams', params);

    return this.formatResponse(response, `Found ${response.total} webcams near ${latitude},${longitude}`);
  }

  private async getMapClusters(args: any): Promise<WindyToolResponse> {
    const { ne_lat, ne_lng, sw_lat, sw_lng } = args;

    if (ne_lat === undefined || ne_lng === undefined || sw_lat === undefined || sw_lng === undefined) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Bounding box coordinates (ne_lat, ne_lng, sw_lat, sw_lng) are required');
    }

    // v3 takes four discrete corner coordinates instead of the retired
    // combined "ne"/"sw" strings, and has no `cluster`/`limit` params.
    const params: WindyMapClusterParams = {
      northLat: ne_lat,
      eastLon: ne_lng,
      southLat: sw_lat,
      westLon: sw_lng,
      zoom: args.zoom || 10,
      include: args.include || 'images,location',
    };

    const clusters = await this.makeWindyRequest<WindyMapClustersResponse>('/webcams/api/v3/map/clusters', params);

    return this.formatResponse(clusters, `Retrieved ${clusters.length} webcam clusters for map display`);
  }

  private async getCategories(args: any): Promise<WindyToolResponse> {
    const params: { lang?: string } = {};
    if (args.lang) params.lang = args.lang;

    const categories = await this.makeWindyRequest<WindyCategoriesResponse>('/webcams/api/v3/categories', params);

    return this.formatResponse(categories, `Retrieved ${categories.length} available categories`);
  }

  private async getCountries(args: any): Promise<WindyToolResponse> {
    const params: { lang?: string } = {};
    if (args.lang) params.lang = args.lang;

    const countries = await this.makeWindyRequest<WindyGeoRegionsResponse>('/webcams/api/v3/countries', params);

    return this.formatResponse(countries, `Retrieved ${countries.length} available countries`);
  }

  private async getRegions(args: any): Promise<WindyToolResponse> {
    const params: { lang?: string } = {};
    if (args.lang) params.lang = args.lang;

    const regions = await this.makeWindyRequest<WindyGeoRegionsResponse>('/webcams/api/v3/regions', params);

    return this.formatResponse(regions, `Retrieved ${regions.length} available regions`);
  }

  private async getContinents(args: any): Promise<WindyToolResponse> {
    const params: { lang?: string } = {};
    if (args.lang) params.lang = args.lang;

    const continents = await this.makeWindyRequest<WindyGeoRegionsResponse>('/webcams/api/v3/continents', params);

    return this.formatResponse(continents, `Retrieved ${continents.length} available continents`);
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
