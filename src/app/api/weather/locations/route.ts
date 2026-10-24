import { createWeatherLocationsService } from "@/server/weather-locations";

const serve = createWeatherLocationsService();
export function GET(request: Request) { return serve(request); }
