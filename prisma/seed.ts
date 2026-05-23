import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear existing
  await prisma.reservation.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.warehouse.deleteMany({});

  // Warehouses
  const bangalore = await prisma.warehouse.create({
    data: { name: "Bangalore Hub", location: "Bangalore" },
  });
  const hyderabad = await prisma.warehouse.create({
    data: { name: "Hyderabad Central", location: "Hyderabad" },
  });
  const mumbai = await prisma.warehouse.create({
    data: { name: "Mumbai Logistics", location: "Mumbai" },
  });
  const delhi = await prisma.warehouse.create({
    data: { name: "Delhi Distribution", location: "New Delhi" },
  });

  // Products
  const iphone = await prisma.product.create({
    data: {
      name: "iPhone 15 Pro",
      description: "Apple flagship smartphone with titanium design.",
      image: "https://images.unsplash.com/photo-1695048133142-1a20484d2569",
    },
  });

  const ps5 = await prisma.product.create({
    data: {
      name: "PlayStation 5 Pro",
      description: "Next-gen Sony gaming console with ray tracing.",
      image: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db",
    },
  });

  const macbook = await prisma.product.create({
    data: {
      name: "MacBook Pro M4",
      description: "Apple's most powerful laptop for creators.",
      image: "https://images.unsplash.com/photo-1517336714739-489689fd1ca8",
    },
  });

  const drone = await prisma.product.create({
    data: {
      name: "DJI Mini 4 Pro",
      description: "Compact drone with 4K HDR video and obstacle sensing.",
      image: "https://images.unsplash.com/photo-1579829366248-204fe8413f31",
    },
  });

  const camera = await prisma.product.create({
    data: {
      name: "Sony Alpha a7 IV",
      description: "Mirrorless camera with 33MP full-frame sensor.",
      image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32",
    },
  });

  const mouse = await prisma.product.create({
    data: {
      name: "Logitech MX Master 3S",
      description: "Premium wireless mouse with quiet clicks.",
      image: "https://images.unsplash.com/photo-1615663245857-ac93bb7c3c9c",
    },
  });

  // Inventory
  await prisma.inventory.createMany({
    data: [
      { productId: iphone.id, warehouseId: bangalore.id, totalStock: 15 },
      { productId: iphone.id, warehouseId: mumbai.id, totalStock: 3 }, // Low stock
      { productId: ps5.id, warehouseId: delhi.id, totalStock: 5 }, // Low stock
      { productId: ps5.id, warehouseId: hyderabad.id, totalStock: 12 },
      { productId: macbook.id, warehouseId: bangalore.id, totalStock: 8 },
      { productId: drone.id, warehouseId: mumbai.id, totalStock: 2 }, // Ultra low stock
      { productId: drone.id, warehouseId: delhi.id, totalStock: 10 },
      { productId: camera.id, warehouseId: hyderabad.id, totalStock: 4 }, // Low stock
      { productId: mouse.id, warehouseId: bangalore.id, totalStock: 25 },
      { productId: mouse.id, warehouseId: mumbai.id, totalStock: 30 },
    ],
  });

  console.log("🌱 Database seeded successfully with expanded catalog!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });