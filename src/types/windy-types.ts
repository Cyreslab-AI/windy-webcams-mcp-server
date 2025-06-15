/**
 * TypeScript type definitions for Windy Webcam API
 * API Documentation: https://api.windy.com/webcams/docs
 */

// Base webcam information
export interface WindyWebcam {
  id: string;
  status: string;
  title: string;
  image: {
    current: {
      icon: string;
      thumbnail: string;
      preview: string;
      toenail: string;
    };
    sizes: {
      icon: {
        width: number;
        height: number;
      };
      thumbnail: {
        width: number;
        height: number;
      };
      preview: {
        width: number;
        height: number;
      };
      toenail: {
        width: number;
        height: number;
      };
    };
    daylight: {
      icon: string;
      thumbnail: string;
      preview: string;
      toenail: string;
    };
    update: number;
  };
  location: {
    city: string;
    region: string;
    region_code: string;
    country: string;
    country_code: string;
    continent: string;
    continent_code: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  url: {
    current: {
      desktop: string;
      mobile: string;
    };
    edit: string;
    daylight: {
      desktop: string;
      mobile: string;
    };
  };
  category?: string[];
  player?: {
    live: {
      available: boolean;
      embed: string;
    };
    day: {
      available: boolean;
      embed: string;
    };
    month: {
      available: boolean;
      embed: string;
    };
    year: {
      available: boolean;
      embed: string;
    };
  };
}

// Map cluster for optimized map display
export interface WindyMapCluster {
  id: string;
  count: number;
  lat: number;
  lng: number;
  webcams?: WindyWebcam[];
}

// Category information
export interface WindyCategory {
  id: string;
  name: string;
}

// Geographic region information
export interface WindyGeoRegion {
  code: string;
  name: string;
}

// API Response wrapper
export interface WindyApiResponse<T> {
  status: string;
  result: T;
}

// Webcams list response
export interface WindyWebcamsResponse {
  offset: number;
  limit: number;
  total: number;
  webcams: WindyWebcam[];
}

// Map clusters response
export interface WindyMapClustersResponse {
  clusters: WindyMapCluster[];
}

// Single webcam response
export interface WindySingleWebcamResponse {
  webcam: WindyWebcam;
}

// Categories response
export interface WindyCategoriesResponse {
  categories: WindyCategory[];
}

// Geographic regions response
export interface WindyGeoRegionsResponse {
  continents?: WindyGeoRegion[];
  countries?: WindyGeoRegion[];
  regions?: WindyGeoRegion[];
}

// Search parameters for webcams
export interface WindyWebcamSearchParams {
  show?: string; // Fields to include in response
  lang?: string; // Language code (e.g., 'en', 'de', 'fr')
  include?: string; // Additional data to include
  exclude?: string; // Data to exclude
  
  // Geographic filters
  continent?: string; // Continent code
  country?: string; // Country code
  region?: string; // Region code
  nearby?: string; // Lat,lng coordinates for nearby search
  bbox?: string; // Bounding box: sw_lat,sw_lng,ne_lat,ne_lng
  
  // Category filters
  category?: string; // Category IDs (comma-separated)
  webcam?: string; // Specific webcam IDs (comma-separated)
  
  // Pagination
  offset?: number; // Result offset (default: 0)
  limit?: number; // Number of results (default: 10, max: 50)
  
  // Ordering
  order?: string; // Order by field (e.g., 'hotness', 'new', 'recent')
}

// Map cluster search parameters
export interface WindyMapClusterParams {
  ne?: string; // Northeast corner coordinates (lat,lng)
  sw?: string; // Southwest corner coordinates (lat,lng)
  zoom?: number; // Zoom level
  cluster?: boolean; // Enable clustering
  limit?: number; // Maximum number of webcams per cluster
  include?: string; // Additional data to include
  lang?: string; // Language code
}

// Export all webcams format
export interface WindyExportWebcam {
  id: string;
  title: string;
  viewCount: number;
  lastUpdatedOn: string;
  webcamUrl: string;
  previewUrl: string;
  lat: number;
  lng: number;
  locationText: string;
}

export interface WindyExportResponse {
  webcams: WindyExportWebcam[];
}

// Cache entry interface
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Server configuration
export interface WindyServerConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  cacheTTL: number;
  rateLimitDelay: number;
  userAgent: string;
}

// Error types
export interface WindyApiError {
  status: string;
  error: {
    code: number;
    message: string;
    details?: string;
  };
}

// Tool response format
export interface WindyToolResponse {
  success: boolean;
  summary: string;
  data?: any;
  error?: string;
  cached?: boolean;
  api_info?: {
    rate_limit_remaining?: number;
    cache_hit?: boolean;
    response_time_ms?: number;
  };
}
