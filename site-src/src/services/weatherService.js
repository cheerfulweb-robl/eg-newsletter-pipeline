/**
 * Weather Service for East Gwillimbury Communities
 * Powered by OpenWeather API with graceful seasonal simulation fallback
 */

export const GEORGINA_WEATHER_COMMUNITIES = {
  'holland-landing': {
    slug: 'holland-landing',
    name: 'Holland Landing',
    tagline: 'Historic river-side village',
    lat: 44.0994,
    lon: -79.4892,
    highlights: ['Anchor Park', 'Holland River Trail', 'Holland Landing Community Centre']
  },
  'queensville': {
    slug: 'queensville',
    name: 'Queensville',
    tagline: 'Known for new residential development and the Health and Active Living Plaza',
    lat: 44.1422,
    lon: -79.4497,
    highlights: ['Health and Active Living Plaza', 'Queensville Park', 'Leslie Street Corridor']
  },
  'sharon': {
    slug: 'sharon',
    name: 'Sharon',
    tagline: 'Historic hamlet with the Sharon Temple, a National Historic Site',
    lat: 44.1003,
    lon: -79.4339,
    highlights: ['Sharon Temple National Historic Site', 'Civic Centre', 'Music & Market Nights']
  },
  'mount-albert': {
    slug: 'mount-albert',
    name: 'Mount Albert',
    tagline: 'Small-town character, residential and community focus',
    lat: 44.1408,
    lon: -79.3142,
    highlights: ['Mount Albert Lions Community Centre', 'Vivian Creek Park', 'Downtown Mount Albert']
  },
  'brown-hill': {
    slug: 'brown-hill',
    name: 'Brown Hill',
    tagline: 'Rural community in the northern part of the town',
    lat: 44.1950,
    lon: -79.3350,
    highlights: ['Ravenshoe Road Corridor', 'Rural Trails', 'Northern Countryside']
  },
  'franklin': {
    slug: 'franklin',
    name: 'Franklin',
    tagline: 'Small rural settlement',
    lat: 44.1856,
    lon: -79.3925,
    highlights: ['Rural Heritage', 'Country Roads', 'Local Farms']
  },
  'holt': {
    slug: 'holt',
    name: 'Holt',
    tagline: 'Formerly Eastville, also rural in character',
    lat: 44.1464,
    lon: -79.3653,
    highlights: ['Holt Country Roads', 'Eastville Heritage', 'Agricultural Greenbelt']
  },
  'ravenshoe': {
    slug: 'ravenshoe',
    name: 'Ravenshoe',
    tagline: 'Community near the north edge of the township',
    lat: 44.2058,
    lon: -79.3831,
    highlights: ['Northern Township Edge', 'Scenic Farmland', 'Regional Cycling Routes']
  },
  'river-drive-park': {
    slug: 'river-drive-park',
    name: 'River Drive Park',
    tagline: 'Rural area along the river corridor',
    lat: 44.1558,
    lon: -79.5019,
    highlights: ['Holland River Corridor', 'River Drive Community', 'Waterfront Nature']
  }
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Format a Date object to DD-Month-YYYY
 */
export function formatDDMonthYYYY(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = MONTH_NAMES[date.getMonth()];
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Fetch 7-day forecast from OpenWeather API or fallback simulation
 */
export async function getCommunityWeather(communitySlug) {
  const meta = GEORGINA_WEATHER_COMMUNITIES[communitySlug] || GEORGINA_WEATHER_COMMUNITIES['holland-landing'];
  const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;

  if (apiKey && apiKey !== 'your_openweather_api_key_here') {
    try {
      // 1. Try OneCall 3.0
      const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${meta.lat}&lon=${meta.lon}&exclude=minutely,hourly,alerts&units=metric&appid=${apiKey}`;
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        return parseOneCallData(data, meta);
      }

      // 2. Fallback to standard 2.5 5-day forecast if OneCall 3.0 is not subscribed
      const url2 = `https://api.openweathermap.org/data/2.5/forecast?lat=${meta.lat}&lon=${meta.lon}&units=metric&appid=${apiKey}`;
      const res2 = await fetch(url2);
      if (res2.ok) {
        const data2 = await res2.json();
        return parseForecast25Data(data2, meta);
      }
    } catch (err) {
      console.warn('Notice: OpenWeather API request failed, falling back to simulated model:', err);
    }
  }

  // Graceful realistic simulated 7-day weather model for East Gwillimbury
  return generateSimulatedWeather(meta);
}

function parseOneCallData(data, meta) {
  const current = {
    temp: Math.round(data.current.temp),
    feelsLike: Math.round(data.current.feels_like),
    condition: data.current.weather[0]?.main || 'Clear',
    description: data.current.weather[0]?.description || 'Clear sky',
    icon: data.current.weather[0]?.icon || '01d',
    humidity: data.current.humidity,
    windSpeed: Math.round(data.current.wind_speed * 3.6), // m/s to km/h
    uvIndex: Math.round(data.current.uvi),
    pressure: data.current.pressure
  };

  const daily = (data.daily || []).slice(0, 7).map((day, idx) => {
    const d = new Date(day.dt * 1000);
    return {
      dateFormatted: formatDDMonthYYYY(d),
      dayName: idx === 0 ? 'Today' : (idx === 1 ? 'Tomorrow' : DAY_NAMES[d.getDay()]),
      tempMax: Math.round(day.temp.max),
      tempMin: Math.round(day.temp.min),
      condition: day.weather[0]?.main || 'Clear',
      description: day.weather[0]?.description || 'Clear skies',
      icon: day.weather[0]?.icon || '01d',
      pop: Math.round((day.pop || 0) * 100),
      windSpeed: Math.round((day.wind_speed || 3) * 3.6),
      humidity: day.humidity
    };
  });

  return {
    community: meta,
    current,
    daily,
    dataSource: 'Live OpenWeather API'
  };
}

function parseForecast25Data(data, meta) {
  const list = data.list || [];
  const currentItem = list[0] || {};
  const current = {
    temp: Math.round(currentItem.main?.temp || 12),
    feelsLike: Math.round(currentItem.main?.feels_like || 11),
    condition: currentItem.weather?.[0]?.main || 'Clear',
    description: currentItem.weather?.[0]?.description || 'Scattered clouds',
    icon: currentItem.weather?.[0]?.icon || '02d',
    humidity: currentItem.main?.humidity || 65,
    windSpeed: Math.round((currentItem.wind?.speed || 4) * 3.6),
    uvIndex: 3,
    pressure: currentItem.main?.pressure || 1015
  };

  // Group by day
  const dailyMap = new Map();
  list.forEach(item => {
    const d = new Date(item.dt * 1000);
    const key = d.toISOString().split('T')[0];
    if (!dailyMap.has(key)) {
      dailyMap.set(key, []);
    }
    dailyMap.get(key).push(item);
  });

  const daily = Array.from(dailyMap.entries()).slice(0, 7).map(([dateStr, items], idx) => {
    const d = new Date(dateStr + 'T12:00:00');
    const temps = items.map(it => it.main.temp);
    const rep = items[Math.floor(items.length / 2)] || items[0];
    return {
      dateFormatted: formatDDMonthYYYY(d),
      dayName: idx === 0 ? 'Today' : (idx === 1 ? 'Tomorrow' : DAY_NAMES[d.getDay()]),
      tempMax: Math.round(Math.max(...temps)),
      tempMin: Math.round(Math.min(...temps)),
      condition: rep.weather?.[0]?.main || 'Partly Cloudy',
      description: rep.weather?.[0]?.description || 'Clear intervals',
      icon: rep.weather?.[0]?.icon || '02d',
      pop: Math.round((rep.pop || 0) * 100),
      windSpeed: Math.round((rep.wind?.speed || 4) * 3.6),
      humidity: rep.main?.humidity || 60
    };
  });

  return {
    community: meta,
    current,
    daily,
    dataSource: 'Live OpenWeather 2.5'
  };
}

function generateSimulatedWeather(meta) {
  const now = new Date();
  const current = {
    temp: 11,
    feelsLike: 10,
    condition: 'Partly Cloudy',
    description: 'Crisp riverfront breeze with sunny intervals',
    icon: '02d',
    humidity: 62,
    windSpeed: 14,
    uvIndex: 3,
    pressure: 1016
  };

  const conditions = [
    { cond: 'Sunny', desc: 'Clear blue skies over East Gwillimbury', icon: '01d', high: 12, low: 4, pop: 10, wind: 12 },
    { cond: 'Partly Cloudy', desc: 'Sun with passing clouds', icon: '02d', high: 11, low: 3, pop: 20, wind: 15 },
    { cond: 'Mostly Sunny', desc: 'Mild afternoon across the township', icon: '01d', high: 13, low: 5, pop: 15, wind: 11 },
    { cond: 'Light Rain', desc: 'Passing morning showers', icon: '10d', high: 9, low: 2, pop: 60, wind: 18 },
    { cond: 'Clear & Crisp', desc: 'Bright sunny autumn day', icon: '01d', high: 10, low: 1, pop: 5, wind: 10 },
    { cond: 'Cloudy', desc: 'Overcast with calm winds', icon: '04d', high: 8, low: 2, pop: 25, wind: 8 },
    { cond: 'Sunny Intervals', desc: 'Scattered clouds, ideal for trails', icon: '02d', high: 10, low: 3, pop: 15, wind: 12 }
  ];

  const daily = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const c = conditions[i % conditions.length];
    daily.push({
      dateFormatted: formatDDMonthYYYY(d),
      dayName: i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : DAY_NAMES[d.getDay()]),
      tempMax: c.high,
      tempMin: c.low,
      condition: c.cond,
      description: c.desc,
      icon: c.icon,
      pop: c.pop,
      windSpeed: c.wind,
      humidity: 60 + (i * 2)
    });
  }

  return {
    community: meta,
    current,
    daily,
    dataSource: 'Preview (Plug in OpenWeather API Key for Live Feed)'
  };
}
