export interface Visualization {
  id: string;
  createdBy: string;
  title: string;
  subject: string | null;
  majorUnit: string | null;
  minorUnit: string | null;
  description: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisualizationListResult {
  items: Visualization[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VisualizationFacets {
  subject: string[];
  majorUnit: string[];
  minorUnit: string[];
}

export interface VisualizationFilters {
  q?: string;
  subject?: string;
  majorUnit?: string;
  minorUnit?: string;
  mine?: boolean;
  page?: number;
  pageSize?: number;
}
