import Image from "next/image";

export default function SectionDivider() {
  return (
    <div className="flex items-center justify-center py-6">
      <Image
        src="/images/divider.png"
        alt=""
        width={300}
        height={30}
        className="opacity-60"
      />
    </div>
  );
}
