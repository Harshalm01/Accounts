const fetch = require('node-fetch');

async function testBrandAPI() {
  try {
    // Get all brands
    const brandsResponse = await fetch('http://localhost:3000/api/brands');
    const brands = await brandsResponse.json();
    console.log('\n=== BRANDS API RESPONSE ===');
    console.log(JSON.stringify(brands, null, 2));

    // Get details for each brand
    for (const brand of brands) {
      console.log(`\n=== BRAND DETAILS: ${brand.name} ===`);
      const detailResponse = await fetch(`http://localhost:3000/api/brands/${brand.id}`);
      const details = await detailResponse.json();
      console.log(`Campaigns count: ${details.campaigns?.length || 0}`);
      if (details.campaigns && details.campaigns.length > 0) {
        console.log('Campaigns:', JSON.stringify(details.campaigns, null, 2));
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testBrandAPI();
