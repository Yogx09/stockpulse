async function test() {
  const p = await fetch('http://localhost:3000/api/products').then(r => r.json());
  console.log('Product 0 inv 0:', p[0].inventories[0].id);
  const res = await fetch('http://localhost:3000/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventoryId: p[0].inventories[0].id, quantity: 1 })
  }).then(r => r.json());
  console.log('Created res:', res);
  const conf = await fetch('http://localhost:3000/api/reservations/' + res.reservation.id + '/confirm', {
    method: 'POST'
  }).then(async r => ({ status: r.status, data: await r.json() }));
  console.log('Confirmed:', conf);
}

test();
