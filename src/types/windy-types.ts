/**
 * TypeScript type definitions for Windy Webcam API v3
 * API Documentation: https://api.windy.com/webcams/docs
 *
 * v3 responses are NOT wrapped in a `{ status, result }` envelope like the
 * retired v2 API — each endpoint returns its data (object or array) directly.
 */

// Category tag attached to a webcam
export interface WindyWebcamCategory {
  id: string;
  name: string;
}

// Webcam location details (present when `include` contains "location")
export interface WindyWebcamLocation {
  latitude: number;
  longitude: number;
  city?: string;
  city_code?: string;
  region?: string;
  region_code?: string;
  country?: string;
  country_code?: string;
  continent?: string;
  continent_code?: string;
}

// Webcam image URLs (present when `include` contains "images"); shape is
// tier-dependent so it is kept loosely typed here.
export interface WindyWebcamImages {
  current?: Record<string, any>;
  daylight?: Record<string, any>;
  sizes?: Record<string, any>;
}

// Embeddable player URLs (present when `include` contains "player")
export interface WindyWebcamPlayer {
  live?: string;
  day?: string;
  month?: string;
  year?: string;
  lifetime?: string;
}

// Webcam detail/action URLs (present when `include` contains "urls")
export interface WindyWebcamUrls {
  detail?: string;
  edit?: string;
  provider?: string;
}

// Base webcam information. Which optional fields are populated depends on
// the `include` parameter sent with the request.
export interface WindyWebcam {
  webcamId: number;
  title: string;
  status: 'active' | 'inactive' | 'unapproved' | 'disabled' | 'rejected' | 'duplicate' | 'merged';
  viewCount: number;
  lastUpdatedOn: string;
  clusterSize?: number; // only present on /map/clusters results
  categories?: WindyWebcamCategory[];
  images?: WindyWebcamImages;
  location?: WindyWebcamLocation;
  player?: WindyWebcamPlayer;
  urls?: WindyWebcamUrls;
}

// Category information (GET /webcams/api/v3/categories)
export interface WindyCategory {
  id: string;
  name: string;
}

// Geographic region information (GET .../countries|regions|continents)
export interface WindyGeoRegion {
  code: string;
  name: string;
}

// GET /webcams/api/v3/webcams response
export interface WindyWebcamsResponse {
  total: number;
  webcams: WindyWebcam[];
}

// GET /webcams/api/v3/webcams/{webcamId} response — the webcam object itself
export type WindySingleWebcamResponse = WindyWebcam;

// GET /webcams/api/v3/map/clusters response — a bare array of representative
// webcams; `clusterSize` on each entry indicates how many webcams it stands in for.
export type WindyMapClustersResponse = WindyWebcam[];

// GET /webcams/api/v3/categories response — a bare array
export type WindyCategoriesResponse = WindyCategory[];

// GET /webcams/api/v3/countries|regions|continents response — a bare array
export type WindyGeoRegionsResponse = WindyGeoRegion[];

// Valid values for the v3 `include` parameter
export type WindyIncludeValue = 'categories' | 'images' | 'location' | 'player' | 'urls';

// Valid values for the v3 `sortKey` / `sortDirection` parameters
export type WindySortKey = 'popularity' | 'createdOn';
export type WindySortDirection = 'asc' | 'desc';

// Search parameters for GET /webcams/api/v3/webcams.
// Array-typed query parameters (categories, continents, countries, regions,
// cities, webcamIds, include) are declared with OpenAPI `explode: false`,
// meaning the API expects a single comma-separated string, e.g.
// "categories=beach,city" — NOT repeated keys or `key[]=` notation.
export interface WindyWebcamSearchParams {
  lang?: string;
  include?: string; // comma-separated WindyIncludeValue list

  // Geographic filters (comma-separated geo codes)
  continents?: string;
  countries?: string;
  regions?: string;
  cities?: string;
  nearby?: string; // "latitude,longitude,radiusKm" (radius max 250km)
  bbox?: string; // "north_lat,east_lon,south_lat,west_lon"

  // Category filters (comma-separated category ids, max 10)
  categories?: string;
  categoryOperation?: 'and' | 'or'; // requires `categories`; default "and"

  // Direct lookup by id (comma-separated, max 50) — bypasses other filters
  webcamIds?: string;

  // Pagination
  offset?: number; // default 0
  limit?: number; // default 10, max 50

  // Sorting
  sortKey?: WindySortKey;
  sortDirection?: WindySortDirection;
}

// Map cluster search parameters for GET /webcams/api/v3/map/clusters.
// Note the v3 endpoint takes four discrete corner coordinates (and no
// `cluster`/`limit` params, unlike the retired v2 contract).
export interface WindyMapClusterParams {
  northLat: number;
  southLat: number;
  eastLon: number;
  westLon: number;
  zoom: number; // 4-18
  include?: string;
  lang?: string;
}

// Export all webcams format (GET /webcams/export/all-webcams.json)
export interface WindyExportWebcamLocation {
  latitude: number;
  longitude: number;
  regionCode?: string;
  countryCode?: string;
  continentCode?: string;
}

export interface WindyExportWebcam {
  status: string;
  webcamId: number;
  title: string;
  viewCount: number;
  preview: string;
  hasPanorama: boolean;
  hasLivestream: boolean;
  categories: string[];
  location: WindyExportWebcamLocation;
}

export interface WindyExportResponse {
  updatedOn: string;
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

// Error shape returned by the live API (NestJS-style error body)
export interface WindyApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
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
