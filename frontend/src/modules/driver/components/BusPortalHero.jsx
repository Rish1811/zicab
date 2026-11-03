import React from 'react';

/// The ZI Bus coach on the night road, in the same navy and yellow as the
/// rider's bus pages. Drawn rather than a photo, so it stays sharp at any size.
const BusPortalHero = () => (
  <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#0a1a33] to-[#123266]" aria-hidden="true">
    <svg
      viewBox="0 0 640 300"
      preserveAspectRatio="xMidYMax meet"
      className="absolute inset-x-0 bottom-0 h-[78%] w-full lg:bottom-[34%] lg:h-[46%]"
    >
      {/* Skyline */}
      <g fill="#ffffff" opacity="0.06">
        <rect x="20" y="96" width="46" height="130" />
        <rect x="74" y="60" width="34" height="166" />
        <rect x="116" y="112" width="58" height="114" />
        <rect x="430" y="74" width="40" height="152" />
        <rect x="478" y="108" width="62" height="118" />
        <rect x="548" y="52" width="38" height="174" />
      </g>

      {/* Road */}
      <rect x="0" y="226" width="640" height="74" fill="#071226" />
      <g fill="#ffc400" opacity="0.65">
        <rect x="24" y="262" width="58" height="5" rx="2.5" />
        <rect x="136" y="262" width="58" height="5" rx="2.5" />
        <rect x="248" y="262" width="58" height="5" rx="2.5" />
        <rect x="360" y="262" width="58" height="5" rx="2.5" />
        <rect x="472" y="262" width="58" height="5" rx="2.5" />
        <rect x="584" y="262" width="58" height="5" rx="2.5" />
      </g>

      {/* Headlight */}
      <path d="M540 196 L640 174 L640 226 Z" fill="#ffc400" opacity="0.16" />

      {/* Coach */}
      <path
        d="M92 102 a18 18 0 0 1 18 -18 h388 a30 30 0 0 1 27 17 l21 46 a30 30 0 0 1 3 13 v50 a10 10 0 0 1 -10 10 H102 a10 10 0 0 1 -10 -10 Z"
        fill="#ffc400"
      />
      <path d="M92 182 H549 V210 a10 10 0 0 1 -10 10 H102 a10 10 0 0 1 -10 -10 Z" fill="#0a1a33" />
      <rect x="92" y="172" width="457" height="10" fill="#ffffff" />

      {/* Windows */}
      <g fill="#123266">
        <rect x="110" y="102" width="62" height="56" rx="7" />
        <rect x="180" y="102" width="62" height="56" rx="7" />
        <rect x="250" y="102" width="62" height="56" rx="7" />
        <rect x="320" y="102" width="62" height="56" rx="7" />
        <rect x="390" y="102" width="62" height="56" rx="7" />
      </g>
      <path d="M462 102 h36 a16 16 0 0 1 14 9 l20 45 a2 2 0 0 1 -2 3 h-68 Z" fill="#123266" />
      <g fill="#ffffff" opacity="0.1">
        <path d="M110 150 L150 102 h22 L122 158 h-5 a7 7 0 0 1 -7 -8 Z" />
        <path d="M250 150 L290 102 h22 L262 158 h-5 a7 7 0 0 1 -7 -8 Z" />
        <path d="M390 150 L430 102 h22 L402 158 h-5 a7 7 0 0 1 -7 -8 Z" />
      </g>

      {/* Name, lights */}
      <text x="282" y="208" fill="#ffc400" fontFamily="Outfit, sans-serif" fontSize="22" fontWeight="800" letterSpacing="3">ZI BUS</text>
      <rect x="534" y="186" width="15" height="11" rx="3" fill="#fff4c2" />
      <rect x="92" y="186" width="9" height="13" rx="2" fill="#f43f5e" />

      {/* Wheels */}
      <g>
        <circle cx="190" cy="222" r="26" fill="#071226" />
        <circle cx="190" cy="222" r="12" fill="#94a3b8" />
        <circle cx="190" cy="222" r="4" fill="#071226" />
        <circle cx="462" cy="222" r="26" fill="#071226" />
        <circle cx="462" cy="222" r="12" fill="#94a3b8" />
        <circle cx="462" cy="222" r="4" fill="#071226" />
      </g>
    </svg>
  </div>
);

export default BusPortalHero;
