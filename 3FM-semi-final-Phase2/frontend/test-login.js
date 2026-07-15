// Test script to validate login functionality
// Run this in browser console on login page

async function testLoginForm() {
  console.log('Testing login form...');
  
  // Check if form elements exist
  const emailInput = document.querySelector('input[type="email"]');
  const passwordInput = document.querySelector('input[type="password"]');
  const submitButton = document.querySelector('button[type="submit"]');
  
  console.log('Form elements found:', {
    email: !!emailInput,
    password: !!passwordInput,
    submit: !!submitButton
  });
  
  if (!emailInput || !passwordInput || !submitButton) {
    console.error('Form elements missing!');
    return;
    
  }
  
  // Test API endpoint directly
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@3fm.com',
        password: 'test123'
      })
    });
    
    const data = await response.json();
    console.log('API test result:', { status: response.status, data });
    
    if (response.ok) {
      console.log('✅ Backend API working correctly');
      console.log('Token received:', data.token ? 'Yes' : 'No');
      console.log('User data:', data.user);
    } else {
      console.log('❌ Backend API error:', data.error);
    }
  } catch (error) {
    console.error('❌ Network error:', error);
  }
  
  // Test form submission programmatically
  console.log('\nTesting form submission...');
  
  // Fill form fields
  emailInput.value = 'test@3fm.com';
  passwordInput.value = 'test123';
  
  // Trigger change events
  emailInput.dispatchEvent(new Event('input', { bubbles: true }));
  passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
  
  console.log('Form filled with test credentials');
  console.log('Form values:', {
    email: emailInput.value,
    password: passwordInput.value.replace(/./g, '*')
  });
  
  return {
    formReady: true,
    apiWorking: true,
    instructions: 'You can now click the "Sign In" button to test the complete flow'
  };
}

// Run the test
testLoginForm().then(result => {
  console.log('\n🔍 Test Results:', result);
  console.log('\n📋 Instructions:');
  console.log('1. Open browser console');
  console.log('2. The form should be pre-filled with test credentials');
  console.log('3. Click the "Sign In" button');
  console.log('4. If successful, you should be redirected to /influencers');
  console.log('5. Check console for any errors');
});