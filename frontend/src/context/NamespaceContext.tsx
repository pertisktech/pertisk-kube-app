import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface NamespaceContextType {
  selectedNamespaces: string[];
  setSelectedNamespaces: (namespaces: string[]) => void;
  toggleNamespace: (namespace: string) => void;
  clearNamespaces: () => void;
  namespaces: string[];
  setNamespaces: (namespaces: string[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const NamespaceContext = createContext<NamespaceContextType | undefined>(undefined);

export const NamespaceProvider = ({ children }: { children: ReactNode }) => {
  const [selectedNamespaces, setSelectedNamespacesState] = useState<string[]>(() => {
    const stored = localStorage.getItem('selectedNamespaces');
    return stored ? JSON.parse(stored) : [];
  });
  const [namespaces, setNamespacesState] = useState<string[]>(() => {
    const stored = localStorage.getItem('availableNamespaces');
    return stored ? JSON.parse(stored) : [];
  });
  const [isLoading, setIsLoading] = useState(false);

  const setSelectedNamespaces = (newNamespaces: string[]) => {
    setSelectedNamespacesState(newNamespaces);
    if (newNamespaces.length > 0) {
      localStorage.setItem('selectedNamespaces', JSON.stringify(newNamespaces));
    } else {
      localStorage.removeItem('selectedNamespaces');
    }
  };

  const setNamespaces = (newNamespaces: string[]) => {
    // Only update if different to avoid unnecessary re-renders
    setNamespacesState((prevNamespaces) => {
      const prevSet = new Set(prevNamespaces);
      const newSet = new Set(newNamespaces);
      
      // Check if sets are equal
      if (prevSet.size === newSet.size && [...prevSet].every((item) => newSet.has(item))) {
        return prevNamespaces;
      }
      
      // Persist to localStorage
      if (newNamespaces.length > 0) {
        localStorage.setItem('availableNamespaces', JSON.stringify(newNamespaces));
      }
      return newNamespaces;
    });
  };

  const toggleNamespace = (namespace: string) => {
    setSelectedNamespaces(
      selectedNamespaces.includes(namespace)
        ? selectedNamespaces.filter((ns) => ns !== namespace)
        : [...selectedNamespaces, namespace]
    );
  };

  const clearNamespaces = () => {
    setSelectedNamespaces([]);
  };

  useEffect(() => {
    if (selectedNamespaces.length > 0) {
      localStorage.setItem('selectedNamespaces', JSON.stringify(selectedNamespaces));
    } else {
      localStorage.removeItem('selectedNamespaces');
    }
  }, [selectedNamespaces]);

  return (
    <NamespaceContext.Provider
      value={{
        selectedNamespaces,
        setSelectedNamespaces,
        toggleNamespace,
        clearNamespaces,
        namespaces,
        setNamespaces,
        isLoading,
        setIsLoading,
      }}
    >
      {children}
    </NamespaceContext.Provider>
  );
};

export const useNamespace = () => {
  const context = useContext(NamespaceContext);
  if (context === undefined) {
    throw new Error('useNamespace must be used within a NamespaceProvider');
  }
  return context;
};
