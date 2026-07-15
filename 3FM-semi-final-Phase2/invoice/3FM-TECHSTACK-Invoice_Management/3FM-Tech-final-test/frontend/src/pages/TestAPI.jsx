import { useEffect, useState } from 'react';
import { influencersAPI } from '../services/api';

const TestAPI = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testAPI();
  }, []);

  const testAPI = async () => {
    try {
      console.log('Fetching data from API...');
      const response = await influencersAPI.getAll();
      console.log('API Response:', response);
      setData(response.data);
    } catch (err) {
      console.error('API Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>API Test</h1>
      <h2>Total Influencers: {data?.count || 0}</h2>
      <h3>First 5 Influencers:</h3>
      <ul>
        {data?.results?.slice(0, 5).map((inf) => (
          <li key={inf.id}>
            {inf.name} - {inf.followers?.toLocaleString()} followers - {inf.location}
          </li>
        ))}
      </ul>
      <details>
        <summary>View Full JSON Response</summary>
        <pre style={{ background: '#f5f5f5', padding: '10px', overflow: 'auto' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
};

export default TestAPI;
