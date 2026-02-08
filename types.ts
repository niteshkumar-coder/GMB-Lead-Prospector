
export interface Lead {
  id: string;
  businessName: string;
  phoneNumber: string;
  address: string;
  rank: number;
  website: string;
  locationLink: string;
  rating: number;
  distance: string;
  keyword: string;
}

export interface SearchParams {
  keyword: string;
  location: string;
  radius: number;
}
