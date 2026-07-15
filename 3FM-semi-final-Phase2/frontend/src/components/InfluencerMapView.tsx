import { useState, useMemo, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getCityCoordinates } from '../utils/indianCities';

// ── Types ───────────────────────────────────────────────────────────────────

interface Influencer {
  id: string;
  firstName: string;
  lastName: string;
  igLink?: string;
  followers: number;
  followersUnit?: 'K' | 'M' | 'None';
  primaryGenre: string;
  city: string;
  state?: string;
}

interface InfluencerMapViewProps {
  influencers: Influencer[];
}

interface CityCluster {
  lng: number;
  lat: number;
  city: string;
  influencers: Influencer[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const INDIA_CENTER: [number, number] = [20.5937, 78.9629]; // [lat, lng] for Leaflet
const INITIAL_ZOOM = 5;

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

function clusterRadius(count: number): number {
  if (count >= 50) return 22;
  if (count >= 20) return 18;
  if (count >= 10) return 14;
  if (count >= 5) return 11;
  return 8;
}

// Fix Leaflet rendering when container is conditionally shown
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    // Small delay to let the DOM settle, then tell Leaflet to recalculate
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Fly to a cluster when clicked
function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], zoom, { duration: 0.8 });
  }, [map, lat, lng, zoom]);
  return null;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function InfluencerMapView({ influencers }: InfluencerMapViewProps) {
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);

  // Group influencers by resolved city coordinates
  const clusters = useMemo<CityCluster[]>(() => {
    const map = new globalThis.Map<string, CityCluster>();

    for (const inf of influencers) {
      if (!inf.city) continue;
      const coords = getCityCoordinates(inf.city);
      if (!coords) continue;

      const key = `${coords[0]},${coords[1]}`;
      const existing = map.get(key);
      if (existing) {
        existing.influencers.push(inf);
      } else {
        map.set(key, {
          lng: coords[0],
          lat: coords[1],
          city: inf.city,
          influencers: [inf],
        });
      }
    }

    return Array.from(map.values());
  }, [influencers]);

  const unresolvedCount = useMemo(() => {
    return influencers.filter((inf) => {
      if (!inf.city) return true;
      return getCityCoordinates(inf.city) === null;
    }).length;
  }, [influencers]);

  const handleClusterClick = useCallback((cluster: CityCluster) => {
    setFlyTarget({ lat: cluster.lat, lng: cluster.lng, zoom: 11 });
  }, []);

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-gray-200 dark:border-white/10"
      style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}
    >
      <MapContainer
        center={INDIA_CENTER}
        zoom={INITIAL_ZOOM}
        style={{ width: '100%', height: '100%' }}
        minZoom={3}
        maxZoom={16}
        zoomControl={true}
      >
        <InvalidateSize />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} zoom={flyTarget.zoom} />}

        {clusters.map((cluster) => {
          const count = cluster.influencers.length;
          const radius = clusterRadius(count);
          const sorted = cluster.influencers.slice().sort((a, b) => b.followers - a.followers);

          return (
            <CircleMarker
              key={`${cluster.lng}-${cluster.lat}`}
              center={[cluster.lat, cluster.lng]}
              radius={radius}
              pathOptions={{
                fillColor: '#6366f1',
                fillOpacity: 0.8,
                color: '#818cf8',
                weight: 2,
              }}
              eventHandlers={{
                click: () => handleClusterClick(cluster),
              }}
            >
              <Popup maxWidth={300} minWidth={220}>
                <div className="text-sm">
                  <h3 className="font-semibold text-indigo-600 mb-1 capitalize">
                    {cluster.city} <span className="text-gray-500">({count})</span>
                  </h3>
                  <ul className="max-h-48 overflow-y-auto space-y-1">
                    {sorted.map((inf) => (
                      <li key={inf.id} className="flex items-center justify-between gap-2 py-0.5">
                        <span className="truncate font-medium text-gray-800 text-xs">
                          {inf.firstName} {inf.lastName}
                        </span>
                        <span className="text-gray-500 text-[11px] shrink-0 flex items-center gap-1">
                          {formatFollowers(inf.followers)}
                          {inf.igLink && (
                            <a
                              href={
                                inf.igLink.startsWith('http')
                                  ? inf.igLink
                                  : `https://instagram.com/${inf.igLink.replace(/^@/, '')}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-pink-500 hover:text-pink-400 ml-1"
                              title="Instagram"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                              </svg>
                            </a>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Stats overlay */}
      <div className="absolute top-3 left-3 z-[1000] bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-300 border border-white/10 space-y-0.5 pointer-events-none">
        <div>
          <span className="text-indigo-400 font-semibold">{clusters.length}</span> cities
        </div>
        <div>
          <span className="text-indigo-400 font-semibold">
            {clusters.reduce((sum, c) => sum + c.influencers.length, 0)}
          </span>{' '}
          mapped
        </div>
        {unresolvedCount > 0 && (
          <div className="text-amber-400/80">
            {unresolvedCount} unresolved
          </div>
        )}
      </div>
    </div>
  );
}
