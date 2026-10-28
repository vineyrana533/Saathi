/**
 * Photos for each service card. Free to use under the Unsplash Licence (https://unsplash.com/license).
 * Every photo is credited in docs/image-credits.md. Replace with commissioned Saathi photography
 * when it exists. Never use photos that suggest romance or intimacy, or of public figures.
 */
export interface ServicePhoto {
  src: string;
  alt: string;
}

export const SERVICE_MEDIA: Record<string, { back: ServicePhoto; front: ServicePhoto }> = {
  'personal-driver': {
    back: { src: 'https://images.unsplash.com/photo-1493160503554-640891d88a0c', alt: 'Hands on a car steering wheel on an open road' },
    front: { src: 'https://images.unsplash.com/photo-1747373354146-646351cc7e88', alt: 'A young man driving a car on a sunny day' },
  },
  'event-staff': {
    back: { src: 'https://images.unsplash.com/photo-1783120947325-56ae2d32b98e', alt: 'A staff member wearing a lanyard with a blank badge' },
    front: { src: 'https://images.unsplash.com/photo-1781038507123-cbebc8ec508c', alt: 'People signing up at an outdoor event registration desk' },
  },
  'elder-care': {
    back: { src: 'https://images.unsplash.com/photo-1454875392665-2ac2c85e8d3e', alt: "An older person's hands resting together" },
    front: { src: 'https://images.unsplash.com/photo-1773227055624-07b515ba87c5', alt: 'A caregiver helping an older woman with a walker' },
  },
  'domestic-help': {
    back: { src: 'https://images.unsplash.com/photo-1686178827149-6d55c72d81df', alt: 'Someone vacuuming a sofa' },
    front: { src: 'https://images.unsplash.com/photo-1758272422155-d898efd14f81', alt: 'Someone mopping a living room floor' },
  },
  'medical-support': {
    back: { src: 'https://images.unsplash.com/photo-1765896387387-0538bc9f997e', alt: 'A nurse with an older patient' },
    front: { src: 'https://images.unsplash.com/photo-1631815590058-860e4f83c1e8', alt: 'A health worker checking a blood pressure reading' },
  },
  errands: {
    back: { src: 'https://images.unsplash.com/photo-1743324754696-c636e1aed0b6', alt: 'People standing in a queue' },
    front: { src: 'https://images.unsplash.com/photo-1573855619003-97b4799dcd8b', alt: 'Someone walking with shopping bags' },
  },
};

/** Unsplash serves resized crops by query string; next/image adds width and quality on top. */
export const cropped = (src: string) => `${src}?fit=crop&crop=faces,center&ar=4:5`;
