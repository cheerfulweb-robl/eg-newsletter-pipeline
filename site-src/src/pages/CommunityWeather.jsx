import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  Cloud, 
  Sun, 
  CloudRain, 
  Wind, 
  Droplets, 
  Thermometer, 
  MapPin, 
  Compass, 
  Calendar, 
  ExternalLink, 
  ArrowLeft,
  ChevronRight,
  Info,
  Sparkles
} from 'lucide-react';
import { 
  GEORGINA_WEATHER_COMMUNITIES, 
  getCommunityWeather 
} from '../services/weatherService';

export default function CommunityWeather() {
  const { community: paramCommunity } = useParams();
  const navigate = useNavigate();
  
  const currentSlug = (paramCommunity || 'holland-landing').toLowerCase().replace(/\s+/g, '-');
  const communityMeta = GEORGINA_WEATHER_COMMUNITIES[currentSlug] || GEORGINA_WEATHER_COMMUNITIES['holland-landing'];

  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      const data = await getCommunityWeather(currentSlug);
      if (isMounted) {
        setWeatherData(data);
        setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [currentSlug]);

  const allCommunities = Object.values(GEORGINA_WEATHER_COMMUNITIES);

  return (
    <div className="bg-gray-50 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1440px] mx-auto space-y-8">
        
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <nav className="flex items-center gap-2 text-xs font-bold text-gray-500">
            <Link to="/" className="hover:text-lake-700 transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <Link to="/weather" className="hover:text-lake-700 transition-colors">Weather</Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-lake-900 font-black">{communityMeta.name}</span>
          </nav>

          <Link
            to="/directory"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-lake-800 hover:text-coral-600 font-bold"
          >
            <span>Explore {communityMeta.name} Directory</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Community Switcher Pills */}
        <div className="bg-white rounded-2xl p-2.5 border border-lake-100 shadow-sm overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 min-w-max">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-3">
              East Gwillimbury Communities:
            </span>
            {allCommunities.map(c => {
              const active = c.slug === currentSlug;
              return (
                <button
                  key={c.slug}
                  onClick={() => navigate(`/weather/${c.slug}`)}
                  className={`px-4 py-2 rounded-full text-xs font-black transition-all cursor-pointer ${
                    active
                      ? 'bg-lake-800 text-white shadow-pop-sm'
                      : 'bg-lake-50 hover:bg-lake-100 text-lake-900 border border-lake-200/60'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {loading || !weatherData ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-lake-100 shadow-sm">
            <div className="w-10 h-10 border-4 border-lake-800 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 font-bold text-sm">Loading 7-day weather report for {communityMeta.name}...</p>
          </div>
        ) : (
          <>
            {/* Current Conditions Hero Card — Design B East Gwillimbury Atmospheric Sunset */}
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-lake-950 via-lake-800 to-indigo-950 text-white p-8 sm:p-10 md:p-12 shadow-lift border border-lake-700/50">
              <div className="absolute right-0 top-0 w-96 h-96 bg-sun-400/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute left-1/3 -bottom-10 w-80 h-80 bg-coral-500/10 rounded-full blur-3xl pointer-events-none" />

              <svg
                className="absolute -right-12 -bottom-16 w-[500px] h-[220px] text-white/[0.03] pointer-events-none select-none"
                viewBox="0 0 1440 320"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M0,192L48,197.3C96,203,192,213,288,192C384,171,480,117,576,122.7C672,128,768,192,864,208C960,224,1056,192,1152,165.3C1248,139,1344,117,1392,106.7L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
              </svg>

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                
                {/* Left: Community & Main Temperature */}
                <div className="space-y-4 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lake-900/80 border border-lake-600/70 text-sun-200 text-xs sm:text-sm font-bold shadow-sm backdrop-blur-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-sun-400 animate-pulse" aria-hidden="true"></span>
                    <MapPin className="w-3.5 h-3.5 text-coral-400" />
                    <span>{communityMeta.name}, Ontario &bull; East Gwillimbury Basin</span>
                  </div>

                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1]">
                    {communityMeta.name} <span className="text-sun-300">Weather</span>
                  </h1>
                  <p className="text-blue-100 text-sm sm:text-base leading-relaxed font-medium">
                    {communityMeta.tagline}. Local forecast customized for residents, boaters, anglers, and weekend visitors.
                  </p>

                  <div className="flex items-baseline gap-4 pt-2">
                    <span className="text-6xl sm:text-7xl font-black tracking-tighter text-white font-display">
                      {weatherData.current.temp}°C
                    </span>
                    <div>
                      <span className="block text-xl font-bold text-sun-300">
                        {weatherData.current.condition}
                      </span>
                      <span className="text-xs text-blue-200">
                        Feels like {weatherData.current.feelsLike}°C &bull; {weatherData.current.description}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Weather Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0 lg:max-w-md w-full">
                  <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-blue-200 text-xs font-semibold mb-1">
                      <Wind className="w-4 h-4 text-cyan-300" />
                      <span>Wind & Lake Breeze</span>
                    </div>
                    <p className="text-xl font-black text-white">{weatherData.current.windSpeed} km/h</p>
                    <span className="text-[10px] text-blue-300">Moderate surface chop</span>
                  </div>

                  <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-blue-200 text-xs font-semibold mb-1">
                      <Droplets className="w-4 h-4 text-blue-300" />
                      <span>Relative Humidity</span>
                    </div>
                    <p className="text-xl font-black text-white">{weatherData.current.humidity}%</p>
                    <span className="text-[10px] text-blue-300">Barometer: {weatherData.current.pressure} hPa</span>
                  </div>

                  <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-blue-200 text-xs font-semibold mb-1">
                      <Sun className="w-4 h-4 text-amber-300" />
                      <span>UV Radiation Index</span>
                    </div>
                    <p className="text-xl font-black text-white">{weatherData.current.uvIndex} (Low)</p>
                    <span className="text-[10px] text-blue-300">Sun protection optional</span>
                  </div>

                  <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-blue-200 text-xs font-semibold mb-1">
                      <Compass className="w-4 h-4 text-emerald-300" />
                      <span>GPS Coordinates</span>
                    </div>
                    <p className="text-xs font-black text-white font-mono">{communityMeta.lat.toFixed(4)}, {communityMeta.lon.toFixed(4)}</p>
                    <span className="text-[10px] text-blue-300">OpenWeather station</span>
                  </div>
                </div>

              </div>
            </div>

            {/* 7-DAY EXTENDED FORECAST SECTION */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-lake-100 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-lake-800" />
                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                      7-Day Forecast for {communityMeta.name}
                    </h2>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Daily outlook from {weatherData.daily[0]?.dateFormatted} through {weatherData.daily[6]?.dateFormatted}.
                  </p>
                </div>

                <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full self-start sm:self-auto">
                  Strict 7-Day Window
                </span>
              </div>

              {/* 7-Day Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {weatherData.daily.map((day, idx) => (
                  <div
                    key={day.dateFormatted}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between text-center ${
                      idx === 0 
                        ? 'bg-blue-50/70 border-blue-300 shadow-sm' 
                        : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <span className={`block text-xs font-black uppercase tracking-wider ${idx === 0 ? 'text-lake-800' : 'text-gray-900'}`}>
                        {day.dayName}
                      </span>
                      <span className="block text-[11px] font-bold text-gray-500 mt-0.5">
                        {day.dateFormatted}
                      </span>

                      {/* Weather Icon & Condition */}
                      <div className="my-3 flex flex-col items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-blue-100/60 flex items-center justify-center text-lake-800 mb-1.5">
                          {day.condition.toLowerCase().includes('rain') ? (
                            <CloudRain className="w-5 h-5 text-blue-600" />
                          ) : day.condition.toLowerCase().includes('cloud') ? (
                            <Cloud className="w-5 h-5 text-gray-600" />
                          ) : (
                            <Sun className="w-5 h-5 text-amber-500" />
                          )}
                        </div>
                        <span className="text-xs font-black text-gray-800 leading-tight">
                          {day.condition}
                        </span>
                      </div>
                    </div>

                    {/* Temperatures & Stats */}
                    <div className="pt-3 border-t border-gray-100 space-y-1">
                      <div className="flex items-center justify-center gap-2 text-sm font-black text-gray-900">
                        <span className="text-gray-900">{day.tempMax}°</span>
                        <span className="text-gray-400 text-xs font-bold">/</span>
                        <span className="text-gray-500 font-bold">{day.tempMin}°</span>
                      </div>

                      <div className="flex items-center justify-center gap-1 text-[10px] text-gray-500 font-semibold">
                        <Droplets className="w-3 h-3 text-cyan-600" />
                        <span>{day.pop}% Rain</span>
                      </div>

                      <div className="text-[10px] text-gray-400 font-medium truncate">
                        💨 {day.windSpeed} km/h
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Community Points of Interest & Local Tips */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Points of Interest in Community */}
              <div className="bg-white rounded-3xl p-6 border border-lake-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-black text-gray-900">
                    Featured Locations in {communityMeta.name}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Check local conditions before heading to these popular community destinations:
                </p>
                <div className="space-y-2">
                  {communityMeta.highlights.map(hl => (
                    <div key={hl} className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between text-xs font-bold text-gray-800">
                      <span className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        <span>{hl}</span>
                      </span>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hl + ', ' + communityMeta.name + ', East Gwillimbury, ON')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-800 hover:underline text-[11px] font-bold"
                      >
                        Directions &amp; Reviews &rarr;
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              {/* OpenWeather Source & Coordinates Config Info */}
              <div className="bg-white rounded-3xl p-6 border border-lake-100 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-5 h-5 text-lake-800" />
                    <h3 className="text-base font-black text-gray-900">
                      Weather Feed Configuration
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mb-4">
                    Weather reports are calculated via the <strong>OpenWeather API</strong> targeted specifically to the geographic center of {communityMeta.name}.
                  </p>

                  <div className="space-y-2 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200 font-mono">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Community:</span>
                      <span className="font-bold text-gray-900">{communityMeta.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Latitude:</span>
                      <span className="font-bold text-gray-900">{communityMeta.lat}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Longitude:</span>
                      <span className="font-bold text-gray-900">{communityMeta.lon}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Data Source:</span>
                      <span className="font-bold text-lake-800">{weatherData.dataSource}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>Want to check another town?</span>
                  <Link to="/weather/holland landing" className="text-lake-800 font-bold hover:underline">
                    Holland Landing Hub &rarr;
                  </Link>
                </div>
              </div>

            </div>
          </>
        )}

      </div>
    </div>
  );
}
