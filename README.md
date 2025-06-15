# Windy Webcam MCP Server

[![npm version](https://badge.fury.io/js/windy-webcam-mcp-server.svg)](https://badge.fury.io/js/windy-webcam-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that provides access to the Windy Webcam Public API, enabling AI agents to search and retrieve information about live webcams from around the world.

## Features

### 🌍 Global Webcam Access
- **Search webcams** by location, category, and other criteria
- **Get detailed webcam information** including images, timelapses, and live players
- **Find nearby webcams** using geographic coordinates
- **Browse webcams by category** (beaches, mountains, cities, etc.)

### 🗺️ Geographic Filtering
- **Filter by country, region, or continent**
- **Bounding box searches** for specific geographic areas
- **Map clustering** optimized for map display applications
- **Coordinate-based proximity searches**

### 📊 Comprehensive Data
- **Live webcam feeds** and preview images
- **Location information** with detailed geographic data
- **Category classification** for easy filtering
- **Player embeds** for live streaming integration
- **Export functionality** for bulk webcam data

### 🚀 Performance Features
- **Intelligent caching** with configurable TTL
- **Rate limiting** to respect API quotas
- **Retry logic** with exponential backoff
- **Error handling** with detailed error messages

## Installation

### Prerequisites
- Node.js 18 or higher
- Windy API key (get one at [https://api.windy.com/keys](https://api.windy.com/keys))

### npm Installation
```bash
npm install windy-webcam-mcp-server
```

### From Source
```bash
git clone <repository-url>
cd windy-webcam-mcp-server
npm install
npm run build
```

## Configuration

### Environment Variables
Set your Windy API key as an environment variable:

```bash
export WINDY_API_KEY="your-api-key-here"
```

Or create a `.env` file:
```bash
WINDY_API_KEY=your-api-key-here
```

### API Key
You can obtain a free API key from [Windy API](https://api.windy.com/keys). The API has rate limits but provides access to a comprehensive database of worldwide webcams.

## Usage

### Command Line
```bash
# Using npm
npx windy-webcam-mcp-server

# Using node directly
node build/index.js
```

### MCP Client Integration
Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "windy-webcam": {
      "command": "npx",
      "args": ["windy-webcam-mcp-server"],
      "env": {
        "WINDY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available Tools

### 🔍 search_webcams
Search for webcams with various filters including location, category, and geographic criteria.

**Parameters:**
- `country` - Country code (e.g., "US", "DE", "FR")
- `region` - Region code within a country
- `continent` - Continent code (e.g., "NA", "EU", "AS")
- `category` - Category ID or comma-separated list
- `nearby` - Coordinates for proximity search ("lat,lng")
- `bbox` - Bounding box ("sw_lat,sw_lng,ne_lat,ne_lng")
- `limit` - Number of results (1-50, default: 10)
- `offset` - Result offset for pagination
- `order` - Sort order (hotness, new, recent, random)
- `lang` - Language code (default: "en")

### 📹 get_webcam
Get detailed information about a specific webcam by ID.

**Parameters:**
- `webcam_id` - Webcam identifier (required)
- `include` - Additional data to include
- `lang` - Language code (default: "en")

### 🌍 get_webcams_by_location
Get webcams from a specific geographic location.

**Parameters:**
- `location_type` - Type of location (country, region, continent)
- `location_code` - Location code (required)
- `limit` - Number of results (1-50, default: 20)
- `order` - Sort order

### 🏷️ get_webcams_by_category
Get webcams from specific categories.

**Parameters:**
- `categories` - Category ID or comma-separated list (required)
- `limit` - Number of results (1-50, default: 20)
- `order` - Sort order

### 📍 get_nearby_webcams
Find webcams near specific coordinates.

**Parameters:**
- `latitude` - Latitude coordinate (required)
- `longitude` - Longitude coordinate (required)
- `radius` - Search radius in kilometers
- `limit` - Number of results (1-50, default: 10)

### 🗺️ get_map_clusters
Get webcam clusters optimized for map display.

**Parameters:**
- `ne_lat`, `ne_lng` - Northeast corner coordinates (required)
- `sw_lat`, `sw_lng` - Southwest corner coordinates (required)
- `zoom` - Map zoom level (1-18)
- `cluster` - Enable clustering (default: true)

### 📂 get_categories
Get available webcam categories for filtering.

**Parameters:**
- `lang` - Language code (default: "en")

### 🌎 get_countries
Get available countries with webcams.

**Parameters:**
- `lang` - Language code (default: "en")

### 🏞️ get_regions
Get available regions with webcams.

**Parameters:**
- `lang` - Language code (default: "en")

### 🌍 get_continents
Get available continents with webcams.

**Parameters:**
- `lang` - Language code (default: "en")

### 📦 export_all_webcams
Get basic information about all available webcams.

**Parameters:**
- `format` - Export format (json)

## Example Usage

### Finding Beach Webcams in California
```javascript
// Search for beach webcams in California
await use_mcp_tool({
  server_name: "windy-webcam",
  tool_name: "search_webcams",
  arguments: {
    country: "US",
    region: "US-CA",
    category: "beach",
    limit: 10
  }
});
```

### Getting Webcams Near a Location
```javascript
// Find webcams near San Francisco
await use_mcp_tool({
  server_name: "windy-webcam",
  tool_name: "get_nearby_webcams",
  arguments: {
    latitude: 37.7749,
    longitude: -122.4194,
    limit: 5
  }
});
```

### Getting Available Categories
```javascript
// Get all available categories
await use_mcp_tool({
  server_name: "windy-webcam",
  tool_name: "get_categories",
  arguments: {
    lang: "en"
  }
});
```

## API Response Format

All tools return responses in the following format:

```json
{
  "success": true,
  "summary": "Found 150 webcams (10 returned)",
  "data": {
    "offset": 0,
    "limit": 10,
    "total": 150,
    "webcams": [...]
  },
  "cached": false,
  "api_info": {
    "cache_hit": false,
    "response_time_ms": 245
  }
}
```

## Rate Limiting and Caching

- **Rate Limiting**: 1 second delay between API requests
- **Caching**: 5-minute TTL for most endpoints
- **Retry Logic**: 3 attempts with exponential backoff
- **Error Handling**: Comprehensive error messages with status codes

## Error Handling

The server handles various error scenarios:
- **Invalid API Key**: Returns authentication error
- **Rate Limiting**: Automatic retry with backoff
- **Not Found**: Clear error messages for missing resources
- **Network Issues**: Retry logic with timeout handling

## Development

### Building
```bash
npm run build
```

### Testing
```bash
npm test
```

### Development Mode
```bash
npm run dev
```

## API Documentation

For detailed API documentation, visit: [https://api.windy.com/webcams/docs](https://api.windy.com/webcams/docs)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Check the [API documentation](https://api.windy.com/webcams/docs)
- Review the error messages for troubleshooting
- Ensure your API key is valid and properly configured

---

Built with ❤️ for the Model Context Protocol ecosystem.
