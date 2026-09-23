import { Redirect } from 'expo-router';

// First launch goes to the welcome screen. Once auth exists, redirect signed-in users to /home.
export default function Index() {
  return <Redirect href="/welcome" />;
}
