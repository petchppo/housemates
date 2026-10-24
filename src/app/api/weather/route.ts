import { createWeatherService } from "@/server/weather-service";

const serve = createWeatherService();
export function GET(request: Request) { return serve(request); }
