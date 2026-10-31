/**
 * Localities with approximate centre points (decisions.md T-45). Hand-entered from public map
 * knowledge, accurate to about a kilometre: enough to rank people by straight-line distance and
 * show "about 4 km away". Check before public launch, or replace with a map vendor (step 2).
 * Grouped by city slug and zone name, matching CITY_SEED.
 */
export const LOCALITY_SEED: Record<string, Record<string, [name: string, lat: number, lng: number][]>> = {
  delhi: {
    'South Delhi': [
      ['Saket', 28.5245, 77.2066],
      ['Hauz Khas', 28.5494, 77.2001],
      ['Green Park', 28.559, 77.207],
      ['Malviya Nagar', 28.5355, 77.2096],
      ['Greater Kailash', 28.5482, 77.238],
      ['Lajpat Nagar', 28.5677, 77.2433],
      ['Defence Colony', 28.5733, 77.2316],
      ['Kalkaji', 28.544, 77.258],
      ['Vasant Kunj', 28.52, 77.158],
      ['Chhatarpur', 28.4996, 77.179],
    ],
    'Central Delhi': [
      ['Connaught Place', 28.6315, 77.2167],
      ['Karol Bagh', 28.6519, 77.1909],
      ['Paharganj', 28.6448, 77.213],
      ['Daryaganj', 28.644, 77.2405],
      ['Chandni Chowk', 28.6506, 77.2303],
      ['Chanakyapuri', 28.5976, 77.1867],
    ],
    'West Delhi': [
      ['Rajouri Garden', 28.6492, 77.122],
      ['Janakpuri', 28.6219, 77.0878],
      ['Punjabi Bagh', 28.6683, 77.1314],
      ['Tilak Nagar', 28.64, 77.096],
      ['Vikaspuri', 28.638, 77.071],
      ['Uttam Nagar', 28.621, 77.059],
    ],
    'East Delhi': [
      ['Laxmi Nagar', 28.6304, 77.2773],
      ['Mayur Vihar', 28.6081, 77.2934],
      ['Preet Vihar', 28.6413, 77.295],
      ['Patparganj', 28.6247, 77.3002],
      ['Krishna Nagar', 28.656, 77.28],
      ['Shahdara', 28.6731, 77.2894],
    ],
    'North Delhi': [
      ['Civil Lines', 28.6814, 77.2226],
      ['Kamla Nagar', 28.6814, 77.2058],
      ['Model Town', 28.7159, 77.191],
      ['Pitampura', 28.699, 77.1384],
      ['Shalimar Bagh', 28.7186, 77.1645],
      ['Rohini', 28.738, 77.115],
    ],
    Dwarka: [
      ['Dwarka Sector 6', 28.5921, 77.046],
      ['Dwarka Sector 10', 28.5815, 77.059],
      ['Dwarka Sector 12', 28.5925, 77.039],
      ['Dwarka Sector 21', 28.5523, 77.0583],
      ['Dwarka Sector 23', 28.562, 77.064],
      ['Palam', 28.5895, 77.0838],
    ],
  },
  noida: {
    'Sector 18': [
      ['Sector 18', 28.5708, 77.3261],
      ['Sector 15', 28.5843, 77.3118],
      ['Sector 27', 28.5729, 77.3355],
      ['Sector 44', 28.5545, 77.3393],
      ['Sector 50', 28.5714, 77.3627],
    ],
    'Sector 62': [
      ['Sector 62', 28.6208, 77.3633],
      ['Sector 63', 28.628, 77.378],
      ['Sector 76', 28.5665, 77.384],
    ],
    'Sector 137': [
      ['Sector 137', 28.5089, 77.407],
      ['Sector 128', 28.523, 77.374],
      ['Sector 143', 28.5, 77.42],
    ],
    'Greater Noida West': [
      ['Gaur City', 28.609, 77.429],
      ['Techzone 4', 28.596, 77.444],
    ],
  },
  gurugram: {
    'Cyber City': [
      ['DLF Cyber City', 28.495, 77.089],
      ['DLF Phase 2', 28.489, 77.092],
      ['MG Road', 28.4796, 77.08],
      ['Udyog Vihar', 28.503, 77.083],
    ],
    'Golf Course Road': [
      ['DLF Phase 5', 28.445, 77.098],
      ['Sector 42', 28.458, 77.105],
      ['Sector 43', 28.457, 77.091],
      ['Sector 54', 28.4365, 77.103],
    ],
    'Sohna Road': [
      ['Sector 47', 28.424, 77.053],
      ['Sector 48', 28.419, 77.042],
      ['Sector 49', 28.4105, 77.056],
      ['Badshahpur', 28.394, 77.049],
    ],
    'Sector 56': [
      ['Sector 55', 28.429, 77.11],
      ['Sector 56', 28.423, 77.101],
      ['Sector 57', 28.418, 77.086],
    ],
  },
  mumbai: {
    Andheri: [
      ['Andheri West', 19.1364, 72.8296],
      ['Andheri East', 19.1136, 72.8697],
      ['Jogeshwari', 19.138, 72.849],
    ],
    Bandra: [
      ['Bandra West', 19.0596, 72.8295],
      ['Khar', 19.07, 72.837],
      ['Santacruz', 19.0815, 72.841],
    ],
    Powai: [
      ['Powai', 19.1176, 72.906],
      ['Chandivali', 19.11, 72.897],
      ['Vikhroli', 19.111, 72.928],
    ],
    'Lower Parel': [
      ['Lower Parel', 18.998, 72.83],
      ['Worli', 19.0176, 72.8162],
      ['Prabhadevi', 19.017, 72.829],
    ],
    Malad: [
      ['Malad West', 19.186, 72.848],
      ['Malad East', 19.187, 72.865],
      ['Goregaon', 19.165, 72.849],
    ],
  },
};
