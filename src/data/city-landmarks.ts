import type { RegionId } from "./demo-regions";

export type CityLandmark = {
  name: string;
  shortName: string;
  description: string;
  sourceUrl?: string;
};

/**
 * Original stylized diorama landmarks. Scale, placement and surroundings are
 * symbolic rather than geographically accurate; links provide cultural context.
 */
export const CITY_LANDMARKS: Record<RegionId, CityLandmark> = {
  california: {
    name: "Golden Gate Bridge",
    shortName: "Golden Gate",
    description: "A stylized miniature of the Golden Gate Bridge’s towers and sweeping cables. Its scale and island setting are imaginary.",
    sourceUrl: "https://www.goldengate.org/bridge/history-research/bridge-features/",
  },
  london: {
    name: "Elizabeth Tower (Big Ben)",
    shortName: "Elizabeth Tower",
    description: "London’s Elizabeth Tower houses Big Ben, the Great Bell. This stylized miniature simplifies the tower and its surroundings.",
    sourceUrl: "https://www.parliament.uk/about/living-heritage/building/palace/big-ben/facts-figures/",
  },
  bangkok: {
    name: "Grand Palace-inspired pavilion",
    shortName: "Palace pavilion",
    description: "An original stylized pavilion inspired by Bangkok’s royal palace complex and its pavilions, with imaginary proportions and surroundings.",
    sourceUrl: "https://www.royalgrandpalace.th/en/discover/history",
  },
  tokyo: {
    name: "Tokyo Tower",
    shortName: "Tokyo Tower",
    description: "A stylized miniature of Tokyo’s broadcasting and observation landmark, which opened in 1958. Its proportions and setting are simplified.",
    sourceUrl: "https://en.tokyotower.co.jp/company/",
  },
  oslo: {
    name: "Oslo Opera House",
    shortName: "Oslo Opera",
    description: "Oslo’s fjordside opera house has a roof designed as public space. This angular miniature reimagines its form in a stylized setting.",
    sourceUrl: "https://www.operaen.no/en/about-us-oslo-operahouse/about-the-oslo-opera-house/",
  },
  sydney: {
    name: "Sydney Opera House",
    shortName: "Sydney Opera",
    description: "Jørn Utzon’s distinctive shell-shaped roofs inspire this stylized miniature. Its scale and island surroundings are imaginary.",
    sourceUrl: "https://www.sydneyoperahouse.com/our-story/the-spherical-solution",
  },
};
