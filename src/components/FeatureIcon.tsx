"use client";

import { FaBasketballBall, FaTrophy, FaChartLine } from "react-icons/fa";

const icons = {
  basketball: FaBasketballBall,
  trophy: FaTrophy,
  chart: FaChartLine,
} as const;

export default function FeatureIcon({
  icon,
}: {
  icon: keyof typeof icons;
}) {
  const Icon = icons[icon];
  return (
    <div className="flex justify-center mb-4">
      <Icon className="text-3xl text-burnt-orange" />
    </div>
  );
}
