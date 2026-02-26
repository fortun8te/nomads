// ForzaX — Car Marketplace Landing Page
// Implemented from Figma: node 1506-2564

// ── Asset URLs (served via Figma MCP assets endpoint) ─────────────────────────
const imgHeroCar =
  "https://www.figma.com/api/mcp/asset/c2f40c7a-b9c3-44ed-8754-c06d20d2d12e";

// Car listing images
const imgCar782 = "https://www.figma.com/api/mcp/asset/5121b0b3-9d54-4de0-9528-df3559cdfeab";
const imgCar783 = "https://www.figma.com/api/mcp/asset/305cf1bb-6387-4aff-9f80-93ebe9e43a7f";
const imgCar784 = "https://www.figma.com/api/mcp/asset/589128b5-c8a6-4fc9-bcbb-cd2e9b484b56";
const imgCar785 = "https://www.figma.com/api/mcp/asset/96623697-fc4a-41bd-9647-20a893f9120c";
const imgCar786 = "https://www.figma.com/api/mcp/asset/1f77954d-bdb1-4a3e-8daa-547b3e0bd54e";
const imgCar787 = "https://www.figma.com/api/mcp/asset/996c2874-71c1-4734-8c1a-1bb0e3655bbe";
const imgCar788 = "https://www.figma.com/api/mcp/asset/cbd212b1-4179-4c76-98d7-44c0bb81a8a0";

// Parts category images
const imgParts789 = "https://www.figma.com/api/mcp/asset/fa0cd6ba-26a2-4a0d-992c-215d9c2fd89f";
const imgParts790 = "https://www.figma.com/api/mcp/asset/840c24e1-a099-4538-89c6-d572f6266db0";
const imgParts791 = "https://www.figma.com/api/mcp/asset/7238cb0d-d788-4ef1-85fe-345e1028373f";
const imgParts792 = "https://www.figma.com/api/mcp/asset/6381b749-5144-4827-b2c2-01b1b6ef12ed";
const imgParts793 = "https://www.figma.com/api/mcp/asset/3366acd4-ca58-4412-801a-c14ba866cc35";
const imgParts794 = "https://www.figma.com/api/mcp/asset/1e53693a-0e2f-4c51-970c-ce0f64dc043f";
const imgParts795 = "https://www.figma.com/api/mcp/asset/88ba4f3a-ebfd-4b2a-a50d-5f97b9aea572";
const imgParts796 = "https://www.figma.com/api/mcp/asset/780b22c4-c342-4a2b-968b-b10f0c23e0d3";
const imgParts797 = "https://www.figma.com/api/mcp/asset/8244b856-33b1-4410-8736-1f0c2b247b34";
const imgParts798 = "https://www.figma.com/api/mcp/asset/068009cb-e750-493e-9a99-fec6cbdb67bd";
const imgParts799 = "https://www.figma.com/api/mcp/asset/12f70454-9c12-474c-8cb4-fa519d25a485";
const imgParts800 = "https://www.figma.com/api/mcp/asset/baeb773a-7e5e-412b-9c22-30e8ddcff5ac";
const imgParts801 = "https://www.figma.com/api/mcp/asset/837fd8b3-f21f-42b5-b530-11e9e9ff25da";
const imgParts802 = "https://www.figma.com/api/mcp/asset/6bc7ed4b-4187-4878-8985-4c3bdbe097e8";
const imgParts803 = "https://www.figma.com/api/mcp/asset/d2959a55-e56a-4ca6-bcc9-ebaa3c3cddde";
const imgParts804 = "https://www.figma.com/api/mcp/asset/80ce0de2-1cef-4cc0-8516-9d805e416921";

// Blog article images
const imgBlog805 = "https://www.figma.com/api/mcp/asset/9081de98-8674-414e-b8fa-1f558e685e79";
const imgBlog806 = "https://www.figma.com/api/mcp/asset/f6bbe494-eb98-4359-9690-5865a8b11c97";
const imgBlog807 = "https://www.figma.com/api/mcp/asset/6508181d-2f1a-4db8-9098-5a1213a1307b";

// Icons & brand
const imgCarActiveIcon = "https://www.figma.com/api/mcp/asset/21950fa7-a106-4896-acb4-dc9cf39855fe"; // car-3 (active/white)
const imgCarDefaultIcon = "https://www.figma.com/api/mcp/asset/8a0b1e0a-1ea0-4b00-a062-aaae4480fb90"; // car-02 (default/dark)
const imgLogoVector = "https://www.figma.com/api/mcp/asset/e5341973-316f-485d-97dd-fd6305e9b261";
const imgLoginIcon = "https://www.figma.com/api/mcp/asset/a10c573c-0b9c-4340-b60a-054c0e6ef993";
const imgPlusIcon = "https://www.figma.com/api/mcp/asset/d81eafac-741f-4d65-9bc4-1846fef88e9c";
const imgChevronDown = "https://www.figma.com/api/mcp/asset/b94f7133-f99b-4824-a029-608c4c8aa1f4";
const imgChevronDown2 = "https://www.figma.com/api/mcp/asset/5c699d27-3457-49f8-8a10-ad140c9001ee";
const imgCarMakeIcon = "https://www.figma.com/api/mcp/asset/3a0a574e-4342-4ff2-ba4f-cc985221a434"; // car-01
const imgTargetIcon = "https://www.figma.com/api/mcp/asset/ffee5e19-a7a6-488b-b391-6a9a31000364"; // target-05
const imgLocationIcon = "https://www.figma.com/api/mcp/asset/b7d62e4f-beed-467e-af51-28e6ca2edef5"; // marker-pin-01
const imgMinusIcon = "https://www.figma.com/api/mcp/asset/bfcb9c35-406e-4df9-9200-ba9579d8dbf3";
const imgAddIcon = "https://www.figma.com/api/mcp/asset/fdce7191-0ae3-4ff0-8556-00d02916cca4";
// const imgAddIcon2 = "https://www.figma.com/api/mcp/asset/3f7305d3-c5b1-45c6-bae5-f25c207c5049";
// const imgLogo2 = "https://www.figma.com/api/mcp/asset/cc164054-428f-4a6f-8820-e45f89ea7125";
const imgSocialIcon = "https://www.figma.com/api/mcp/asset/1b0d4768-3339-40d1-bcad-76eac082b567";
const imgVector1 = "https://www.figma.com/api/mcp/asset/d9cf99c5-dd95-400c-bebf-cf973b15f914";
const imgGroup = "https://www.figma.com/api/mcp/asset/88cbcb0a-01ab-42dc-a778-0da5439eb0cd";
const imgUnion = "https://www.figma.com/api/mcp/asset/52bbb1aa-609d-4c3d-a87e-53065f08c9c7";

// ── Data ──────────────────────────────────────────────────────────────────────
const navTabs = ["Active Tab", "Selling", "Selling", "Selling", "Selling"];

const mainTabs = ["Active Tab", "Selling", "Selling", "Selling"];

const carListings = [
  { id: 1, img: imgCar782, location: "Denver, CO", miles: "2,900 Miles", name: "2024 Audi R8", price: "$210,000" },
  { id: 2, img: imgCar783, location: "Denver, CO", miles: "2,900 Miles", name: "2024 Audi R8", price: "$210,000" },
  { id: 3, img: imgCar784, location: "Denver, CO", miles: "2,900 Miles", name: "2024 Audi R8", price: "$210,000" },
  { id: 4, img: imgCar785, location: "Denver, CO", miles: "2,900 Miles", name: "2024 Audi R8", price: "$210,000" },
  { id: 5, img: imgCar786, location: "Denver, CO", miles: "2,900 Miles", name: "2024 Audi R8", price: "$210,000" },
  { id: 6, img: imgCar787, location: "Denver, CO", miles: "2,900 Miles", name: "2024 Audi R8", price: "$210,000" },
  { id: 7, img: imgCar788, location: "Denver, CO", miles: "2,900 Miles", name: "2024 Audi R8", price: "$210,000" },
];

const partsRow1 = [
  { img: imgParts789, label: "Engines" },
  { img: imgParts790, label: "Wheels & Tires" },
  { img: imgParts791, label: "Exhaust Systems" },
  { img: imgParts792, label: "Suspension & Handling" },
  { img: imgParts793, label: "Brakes" },
];

const partsRow2 = [
  { img: imgParts794, label: "Drivetrain" },
  { img: imgParts795, label: "Air Intakes" },
  { img: imgParts796, label: "Lighting" },
  { img: imgParts797, label: "Interior" },
  { img: imgParts798, label: "Exterior" },
];

const partsRow3 = [
  { img: imgParts799, label: "Electronics" },
  { img: imgParts800, label: "Fluids & Filters" },
  { img: imgParts801, label: "Cooling System" },
  { img: imgParts802, label: "Fuel System" },
  { img: imgParts803, label: "Charging Accessories" },
];

const partsRow4 = [
  { img: imgParts804, label: "Detailing" },
  { img: imgParts789, label: "Performance" },
  { img: imgParts790, label: "Safety" },
  { img: imgParts791, label: "Audio" },
  { img: imgParts792, label: "Tools" },
];

const blogArticles = [
  {
    img: imgBlog805,
    date: "February 15, 2025",
    title: "Discover how to fine-tune your vehicle for optimal performance and stunning visual appeal.",
    excerpt: "Learn about brake maintenance, upgrades, and how to identify signs of wear for safer driving.",
  },
  {
    img: imgBlog806,
    date: "February 15, 2025",
    title: "Dive into the future of transportation, exploring the technology, ethics, and impact of self-driving cars.",
    excerpt: "Uncover the potential benefits and hurdles in the quest to create fully autonomous vehicles.",
  },
  {
    img: imgBlog807,
    date: "February 15, 2025",
    title: "Gear up for thrilling off-road journeys with tips on vehicle preparation, safety, and trail etiquette.",
    excerpt: "Find out how proper wheel balancing can enhance your driving experience and save you money on tires.",
  },
  {
    img: imgBlog805,
    date: "February 15, 2025",
    title: "Explore the world of electric vehicles, from the latest models to charging infrastructure and environmental benefits.",
    excerpt: "Treat your car to the ultimate makeover with our guide to professional car wash and detailing services.",
  },
];

const faqLeft = [
  {
    question: "What is ForzaX?",
    answer:
      "ForzaX is your go-to platform for buying and selling cars and parts. Whether you're a pro or just starting out, we've got a huge selection to meet your needs. Contact our support team if you have questions.",
    open: true,
  },
  { question: "How do I create a listing on ForzaX?", open: false },
  { question: "What payment methods are accepted on ForzaX?", open: false },
  { question: "How do I contact a seller on ForzaX?", open: false },
  { question: "Is there a return policy for parts purchased on ForzaX?", open: false },
];

const faqRight = [
  { question: "How does ForzaX ensure the quality of listed cars?", open: false },
  { question: "Can I negotiate the price of a car on ForzaX?", open: false },
  { question: "Are there any fees for buyers on ForzaX?", open: false },
  { question: "How does ForzaX handle disputes between buyers and sellers?", open: false },
  { question: "What types of cars can be listed on ForzaX?", open: false },
];

const footerLinks = [
  { heading: "Company", links: ["About Us", "Careers", "Press", "Blog"] },
  { heading: "Support", links: ["Help Center", "Contact Us", "Privacy Policy", "Terms of Service"] },
  { heading: "Explore", links: ["Marketplace", "Car Parts", "Sell a Car", "Financing"] },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function NavTab({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className={`flex gap-2 items-center justify-center px-4 py-2 border border-solid shrink-0 cursor-pointer select-none
        ${active
          ? "bg-[#0e0e0e] border-[#eaeaea]"
          : "bg-white border-[#eaeaea]"
        }`}
    >
      <div className="relative shrink-0 size-4">
        <img
          alt=""
          className="absolute block max-w-none size-full"
          src={active ? imgCarActiveIcon : imgCarDefaultIcon}
        />
      </div>
      <span
        className={`text-base font-medium leading-6 tracking-[-0.32px] whitespace-nowrap
          ${active ? "text-white" : "text-[#2e2e2e]"}`}
      >
        {label}
      </span>
      <div className="relative shrink-0 size-4">
        <img
          alt=""
          className="absolute block max-w-none size-full"
          src={active ? imgCarActiveIcon : imgCarDefaultIcon}
        />
      </div>
    </div>
  );
}

function SearchDropdown({
  icon,
  label,
  placeholder,
  chevron,
  borderRight = true,
}: {
  icon: string;
  label: string;
  placeholder: string;
  chevron: string;
  borderRight?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-start justify-center px-5 py-4 relative min-w-0
        ${borderRight ? "border-r border-[#eaeaea]" : ""}`}
    >
      <div className="flex gap-3 items-center w-full">
        <div className="bg-[#f5f5f5] flex items-center justify-center rounded-[999px] size-12 shrink-0">
          <div className="relative size-6 shrink-0">
            <img alt="" className="absolute block max-w-none size-full" src={icon} />
          </div>
        </div>
        <div className="flex flex-1 flex-col items-start text-base min-w-0">
          <span className="font-medium text-[#0e0e0e] tracking-[-0.32px] leading-6 whitespace-nowrap">
            {label}
          </span>
          <span className="text-[#797979] leading-6 whitespace-nowrap">
            {placeholder}
          </span>
        </div>
        <div className="bg-[#f5f5f5] flex items-center justify-center p-1 rounded-[36px] size-7 shrink-0">
          <div className="relative size-4 shrink-0">
            <img alt="" className="absolute block max-w-none size-full" src={chevron} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CarCard({
  img,
  location,
  miles,
  name,
  price,
}: {
  img: string;
  location: string;
  miles: string;
  name: string;
  price: string;
}) {
  return (
    <div className="bg-white flex flex-col flex-1 gap-3 items-start min-w-0 p-4 relative rounded-3xl shadow-[0px_2px_2px_0px_rgba(10,13,18,0.04)] cursor-pointer hover:shadow-md transition-shadow">
      <div className="aspect-[290/193] relative rounded-xl shrink-0 w-full overflow-hidden">
        <img
          alt={name}
          className="absolute inset-0 max-w-none object-cover size-full rounded-xl"
          src={img}
        />
      </div>
      <div className="flex flex-col gap-2 items-start w-full">
        <div className="flex font-medium items-center justify-between leading-6 text-sm text-[#797979] tracking-[-0.28px] w-full">
          <span>{location}</span>
          <span>{miles}</span>
        </div>
        <p className="font-semibold leading-7 overflow-hidden text-lg text-[#0e0e0e] text-ellipsis tracking-[-0.36px] w-full whitespace-nowrap">
          {name}
        </p>
        <p className="font-medium leading-6 text-base text-[#2e2e2e] tracking-[-0.32px] w-full">
          {price}
        </p>
      </div>
    </div>
  );
}

function PartCard({ img, label }: { img: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col gap-3 items-start min-w-0 cursor-pointer group">
      <div className="aspect-[290/193] relative rounded-xl shrink-0 w-full overflow-hidden">
        <img
          alt={label}
          className="absolute inset-0 max-w-none object-cover size-full rounded-xl group-hover:scale-105 transition-transform duration-300"
          src={img}
        />
      </div>
      <p className="font-semibold leading-7 overflow-hidden text-lg text-[#0e0e0e] text-center text-ellipsis tracking-[-0.36px] w-full whitespace-nowrap">
        {label}
      </p>
    </div>
  );
}

function BlogCard({
  img,
  date,
  title,
  excerpt,
}: {
  img: string;
  date: string;
  title: string;
  excerpt: string;
}) {
  return (
    <div className="bg-white flex flex-col gap-3 items-start p-4 relative rounded-3xl shadow-[0px_2px_2px_0px_rgba(10,13,18,0.04)] shrink-0 w-[316px] cursor-pointer hover:shadow-md transition-shadow">
      <div className="aspect-[290/193] relative rounded-xl shrink-0 w-full overflow-hidden">
        <img
          alt={title}
          className="absolute inset-0 max-w-none object-cover size-full rounded-xl"
          src={img}
        />
      </div>
      <div className="flex flex-col gap-2 items-start w-full">
        <p className="font-medium leading-6 text-sm text-[#797979] tracking-[-0.28px] w-full">{date}</p>
        <p className="font-semibold leading-7 overflow-hidden text-lg text-[#0e0e0e] text-ellipsis tracking-[-0.36px] w-full line-clamp-3">
          {title}
        </p>
        <p className="leading-6 overflow-hidden text-base text-[#2e2e2e] text-ellipsis tracking-[-0.32px] w-full line-clamp-2">
          {excerpt}
        </p>
      </div>
    </div>
  );
}

function FaqItem({
  question,
  answer,
  open = false,
}: {
  question: string;
  answer?: string;
  open?: boolean;
}) {
  return (
    <div
      className={`border border-[#202020] border-solid flex flex-col items-start rounded-xl shrink-0 w-full
        ${open ? "bg-[#202020] gap-4 p-[21px]" : "p-[20.5px]"}`}
    >
      <div className="flex gap-4 items-center justify-center w-full">
        <p className="flex-1 font-medium leading-6 text-base text-white tracking-[-0.32px] whitespace-pre-wrap min-w-0">
          {question}
        </p>
        <div className="flex items-center justify-center shrink-0 size-6">
          {open ? (
            <div className="rotate-180 flex-none">
              <div className="relative size-6">
                <img alt="" className="absolute block max-w-none size-full" src={imgMinusIcon} />
              </div>
            </div>
          ) : (
            <div className="-rotate-90 flex-none">
              <div className="relative size-6">
                <img alt="" className="absolute block max-w-none size-full" src={imgAddIcon} />
              </div>
            </div>
          )}
        </div>
      </div>
      {open && answer && (
        <p className="leading-6 text-sm text-[#eaeaea] tracking-[-0.28px] w-full whitespace-pre-wrap">
          {answer}
        </p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ForzaXLanding() {
  return (
    <div className="bg-[#f5f5f5] flex flex-col items-center relative w-full min-h-screen overflow-x-hidden">

      {/* ── Navbar ── */}
      <header className="bg-[#f5f5f5] flex items-center justify-between px-16 py-5 w-full shrink-0 z-20 sticky top-0">
        {/* Left: tab row */}
        <div className="flex flex-1 gap-1 items-center min-w-0">
          {navTabs.map((tab, i) => (
            <NavTab key={i} label={tab} active={i === 0} />
          ))}
        </div>

        {/* Center: Logo */}
        <div className="flex gap-1 items-center shrink-0">
          <div className="relative h-full shrink-0 flex items-center">
            <img alt="" className="h-6 w-auto" src={imgLogoVector} />
          </div>
          <p className="font-semibold leading-none text-2xl text-[#0e0e0e] shrink-0">ForzaX</p>
        </div>

        {/* Right: CTA buttons */}
        <div className="flex flex-1 gap-2 items-center justify-end min-w-0">
          <button className="bg-[#eaeaea] flex gap-2 items-center justify-center overflow-clip px-3 py-2 rounded-full shrink-0 hover:bg-[#d5d5d5] transition-colors">
            <div className="overflow-clip relative shrink-0 size-4">
              <img alt="" className="block max-w-none size-full" src={imgLoginIcon} />
            </div>
            <span className="font-medium leading-6 text-base text-[#0e0e0e] tracking-[-0.32px]">Log in</span>
          </button>
          <button className="bg-[#01613a] flex gap-2 items-center justify-center overflow-clip px-3 py-2 rounded-full shrink-0 hover:bg-[#014d2e] transition-colors">
            <div className="overflow-clip relative shrink-0 size-4">
              <img alt="" className="block max-w-none size-full" src={imgPlusIcon} />
            </div>
            <span className="font-medium leading-6 text-base text-white tracking-[-0.32px]">Create listing</span>
          </button>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="flex flex-col items-start pb-16 px-16 w-full shrink-0">
        {/* Hero image */}
        <div className="flex flex-col h-[480px] items-start justify-center overflow-clip relative w-full">
          <div className="flex-1 min-h-0 relative rounded-2xl w-full">
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-2xl">
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <img
                  alt=""
                  className="absolute h-[169.56%] left-0 max-w-none top-[-49.84%] w-full object-cover"
                  src={imgHeroCar}
                />
              </div>
              {/* Bottom fade gradient */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-transparent from-[79%] to-[#f5f5f5]" />
            </div>
          </div>
        </div>

        {/* Headline + CTA */}
        <div className="flex flex-col gap-6 items-start w-full">
          <div className="flex items-end justify-between rounded-t-xl w-full">
            <div className="flex-1 font-medium leading-[48px] text-[40px] text-[#0e0e0e] tracking-[-0.4px] whitespace-pre-wrap min-w-0">
              <p className="mb-0">{"A marketplace for those who "}</p>
              <p>value comfort and craftsmanship.</p>
            </div>
            <button className="bg-[#01613a] flex items-center justify-center overflow-clip px-4 py-2 rounded-full shrink-0 hover:bg-[#014d2e] transition-colors ml-8">
              <span className="font-medium leading-6 text-base text-white tracking-[-0.32px]">
                Explore Marketplace
              </span>
            </button>
          </div>

          {/* Filter tabs + search bar */}
          <div className="flex flex-col gap-4 items-start w-full rounded-b-xl">
            {/* Tabs */}
            <div className="flex gap-1 items-start">
              {mainTabs.map((tab, i) => (
                <NavTab key={i} label={tab} active={i === 0} />
              ))}
            </div>

            {/* Search bar */}
            <div className="bg-white border border-[#eaeaea] border-solid flex items-start overflow-clip relative rounded-2xl w-full">
              <SearchDropdown
                icon={imgCarMakeIcon}
                label="Car Make"
                placeholder="Select"
                chevron={imgChevronDown}
              />
              <SearchDropdown
                icon={imgTargetIcon}
                label="Car Model"
                placeholder="Select"
                chevron={imgChevronDown2}
              />
              <SearchDropdown
                icon={imgLocationIcon}
                label="Location"
                placeholder="Select"
                chevron={imgChevronDown}
              />
              <SearchDropdown
                icon={imgCarMakeIcon}
                label="Mileage"
                placeholder="Select"
                chevron={imgChevronDown}
              />
              <div className="flex flex-1 flex-col items-start justify-center px-5 py-4 relative min-w-0">
                <div className="flex gap-3 items-center w-full">
                  <div className="bg-[#f5f5f5] flex items-center justify-center rounded-[999px] size-12 shrink-0">
                    <div className="relative size-6 shrink-0">
                      <img alt="" className="absolute block max-w-none size-full" src={imgTargetIcon} />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col items-start text-base min-w-0">
                    <span className="font-medium text-[#0e0e0e] tracking-[-0.32px] leading-6 whitespace-nowrap">
                      Price Range
                    </span>
                    <span className="text-[#797979] leading-6 whitespace-nowrap">Select</span>
                  </div>
                </div>
              </div>
              {/* Search button */}
              <div className="flex items-center justify-center px-5 py-4 shrink-0">
                <button className="bg-[#01613a] flex items-center justify-center overflow-clip px-4 py-2 rounded-full hover:bg-[#014d2e] transition-colors whitespace-nowrap">
                  <span className="font-medium leading-6 text-base text-white tracking-[-0.32px]">Search</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Featured Cars Section ── */}
      <section className="bg-[#f5f5f5] flex flex-col gap-6 items-center p-16 w-full shrink-0">
        {/* Section header */}
        <div className="flex flex-col gap-3 items-start w-full">
          <p className="font-medium leading-[48px] text-[40px] text-[#0e0e0e] tracking-[-0.4px] whitespace-pre-wrap w-full">
            Featured Cars
          </p>
          <p className="leading-7 text-xl text-[#797979] w-full">
            Cars available for purchase on ForzaX.
          </p>
        </div>

        {/* Cars grid */}
        <div className="flex flex-col gap-4 items-start w-full">
          {/* Tab row (second set for cars listing) */}
          <div className="flex gap-1 items-start">
            {mainTabs.map((tab, i) => (
              <NavTab key={i} label={tab} active={i === 0} />
            ))}
          </div>

          {/* Car cards */}
          <div className="flex gap-4 items-start w-full">
            {carListings.map((car) => (
              <CarCard key={car.id} {...car} />
            ))}
          </div>
        </div>

        <button className="bg-[#01613a] flex items-center justify-center overflow-clip px-4 py-2 relative rounded-full shrink-0 hover:bg-[#014d2e] transition-colors">
          <span className="font-medium leading-6 text-base text-white tracking-[-0.32px]">View All Cars</span>
        </button>
      </section>

      {/* ── Car Parts Section ── */}
      <section className="bg-[#f5f5f5] flex flex-col gap-6 items-center p-16 rounded-xl w-full shrink-0">
        <div className="flex flex-col gap-3 items-start w-full">
          <p className="font-medium leading-[48px] text-[40px] text-[#0e0e0e] tracking-[-0.4px] whitespace-pre-wrap w-full">
            Forza Car Parts
          </p>
          <p className="leading-7 text-xl text-[#797979] w-full">Forza car part categories.</p>
        </div>

        <div className="flex flex-col gap-4 items-start w-full">
          {[partsRow1, partsRow2, partsRow3, partsRow4].map((row, ri) => (
            <div key={ri} className="flex gap-4 items-center min-w-[300px] w-full">
              {row.map((part, pi) => (
                <PartCard key={pi} img={part.img} label={part.label} />
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Blog Section ── */}
      <section className="bg-[#f5f5f5] flex flex-col gap-6 items-start p-16 w-full shrink-0">
        <div className="flex flex-col gap-3 items-start w-full">
          <p className="font-medium leading-[48px] text-[40px] text-[#0e0e0e] tracking-[-0.4px] whitespace-pre-wrap w-full">
            Forza Journal
          </p>
          <p className="leading-7 text-xl text-[#797979] w-full">
            ForzaX news, guides, and expert insights.
          </p>
        </div>

        <div className="flex gap-4 items-start overflow-x-auto pb-2 w-full">
          {blogArticles.map((article, i) => (
            <BlogCard key={i} {...article} />
          ))}
        </div>
      </section>

      {/* ── Footer + FAQ ── */}
      <section className="flex flex-col items-start px-6 w-full shrink-0">
        <div className="bg-[#0e0e0e] border border-[#202020] border-solid flex flex-col gap-16 items-start p-10 rounded-xl w-full">

          {/* FAQ header + tabs */}
          <div className="flex flex-col gap-6 items-start w-full">
            <div className="flex flex-col gap-3 items-start">
              <p className="font-medium leading-[48px] text-[40px] text-white tracking-[-0.4px] whitespace-pre-wrap w-full">
                Forza FAQs
              </p>
              <p className="leading-7 text-xl text-[#eaeaea] w-full">
                Get answers to your questions.
              </p>
            </div>

            <div className="flex gap-6 items-start w-full">
              {/* FAQ tabs (dark) */}
              <div className="flex flex-1 gap-2 items-center min-w-0">
                {navTabs.map((tab, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 items-center justify-center px-4 py-2 border border-solid border-[#202020] shrink-0 cursor-pointer select-none
                      ${i === 0 ? "bg-[#2e2e2e]" : "bg-[#0e0e0e]"}`}
                  >
                    <div className="relative shrink-0 size-4">
                      <img
                        alt=""
                        className="absolute block max-w-none size-full"
                        src={imgCarActiveIcon}
                      />
                    </div>
                    <span
                      className={`text-base font-medium leading-6 tracking-[-0.32px] whitespace-nowrap
                        ${i === 0 ? "text-white" : "text-[#a9a9a9]"}`}
                    >
                      {tab}
                    </span>
                    <div className="relative shrink-0 size-4">
                      <img
                        alt=""
                        className="absolute block max-w-none size-full"
                        src={imgCarActiveIcon}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button className="bg-[#01613a] flex items-center justify-center overflow-clip px-3 py-2 rounded-full shrink-0 hover:bg-[#014d2e] transition-colors">
                <span className="font-medium leading-6 text-base text-white tracking-[-0.32px]">Help Center</span>
              </button>
            </div>

            {/* FAQ columns */}
            <div className="flex gap-5 items-start w-full">
              {/* Left column */}
              <div className="flex flex-1 flex-col gap-2 items-start min-w-0">
                {faqLeft.map((item, i) => (
                  <FaqItem key={i} question={item.question} answer={item.answer} open={item.open} />
                ))}
              </div>
              {/* Right column */}
              <div className="flex flex-1 flex-col gap-2 items-start min-w-0">
                {faqRight.map((item, i) => (
                  <FaqItem key={i} question={item.question} open={item.open} />
                ))}
              </div>
            </div>
          </div>

          {/* Footer bottom */}
          <div className="flex flex-col gap-8 items-start w-full">
            {/* Logo + links grid */}
            <div className="flex gap-16 items-start w-full">
              {/* Brand */}
              <div className="flex flex-col gap-4 items-start shrink-0">
                <div className="flex gap-1 items-center">
                  <img alt="" className="h-6 w-auto" src={imgLogoVector} style={{ filter: "invert(1)" }} />
                  <p className="font-semibold leading-none text-2xl text-white">ForzaX</p>
                </div>
                <p className="leading-6 text-sm text-[#797979] tracking-[-0.28px] max-w-[240px]">
                  The premium marketplace for discerning car buyers and sellers.
                </p>
                {/* Social icons */}
                <div className="flex gap-3 items-center">
                  <div className="relative size-6 shrink-0 cursor-pointer">
                    <img alt="" className="absolute block max-w-none size-full" src={imgSocialIcon} />
                  </div>
                  <div className="relative size-6 shrink-0 cursor-pointer">
                    <img alt="" className="absolute block max-w-none size-full" src={imgVector1} />
                  </div>
                  <div className="relative size-6 shrink-0 cursor-pointer">
                    <img alt="" className="absolute block max-w-none size-full" src={imgGroup} />
                  </div>
                  <div className="relative size-6 shrink-0 cursor-pointer">
                    <img alt="" className="absolute block max-w-none size-full" src={imgUnion} />
                  </div>
                </div>
              </div>

              {/* Link columns */}
              {footerLinks.map((col) => (
                <div key={col.heading} className="flex flex-col gap-4 items-start flex-1 min-w-0">
                  <p className="font-semibold text-sm text-white tracking-[-0.28px] leading-6">{col.heading}</p>
                  {col.links.map((link) => (
                    <a
                      key={link}
                      href="#"
                      className="text-sm text-[#797979] leading-6 hover:text-white transition-colors"
                    >
                      {link}
                    </a>
                  ))}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-[#202020]" />

            {/* Copyright */}
            <div className="flex items-center justify-between w-full">
              <p className="text-sm text-[#797979] leading-6">© 2025 ForzaX. All rights reserved.</p>
              <div className="flex gap-6 items-center">
                <a href="#" className="text-sm text-[#797979] leading-6 hover:text-white transition-colors">Privacy Policy</a>
                <a href="#" className="text-sm text-[#797979] leading-6 hover:text-white transition-colors">Terms of Service</a>
                <a href="#" className="text-sm text-[#797979] leading-6 hover:text-white transition-colors">Cookies</a>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
