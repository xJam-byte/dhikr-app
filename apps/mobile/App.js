import * as React from "react";
import "./i18n";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import ZikrListScreen from "./screens/ZikrListScreen";
import ZikrDetailScreen from "./screens/ZikrDetailScreen";
import ProfileScreen from "./screens/ProfileScreen";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "./theme/tokens";
import { LangProvider } from "./hooks/useAppLang";

const Stack = createStackNavigator();
const Tabs = createBottomTabNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ZikrList" component={ZikrListScreen} />
      <Stack.Screen name="ZikrDetail" component={ZikrDetailScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <LangProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tabs.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: "#94A3B8",
            tabBarStyle: { backgroundColor: "#fff" },
            tabBarIcon: ({ color, size }) => {
              const map = {
                Home: "home-outline",
                Profile: "person-circle-outline",
              };
              return (
                <Ionicons name={map[route.name]} size={size} color={color} />
              );
            },
          })}
        >
          <Tabs.Screen
            name="Home"
            component={HomeStack}
            options={{ title: "Home" }}
          />
          <Tabs.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: "Profile" }}
          />
        </Tabs.Navigator>
      </NavigationContainer>
    </LangProvider>
  );
}
