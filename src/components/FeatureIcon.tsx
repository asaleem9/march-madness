import Image from "next/image";

const icons = {
  basketball: { src: "/images/features/pick-winners.png", alt: "Pick your winners" },
  trophy: { src: "/images/features/challenge-friends.png", alt: "Challenge friends" },
  chart: { src: "/images/features/track-results.png", alt: "Track live results" },
} as const;

export default function FeatureIcon({
  icon,
}: {
  icon: keyof typeof icons;
}) {
  const { src, alt } = icons[icon];
  return (
    <div className="flex justify-center mb-4">
      <Image
        src={src}
        alt={alt}
        width={80}
        height={80}
        className="rounded"
      />
    </div>
  );
}
