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
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const setSelectedNamespaces = (newNamespaces: string[]) => {
    setSelectedNamespacesState(newNamespaces);
    if (newNamespaces.length > 0) {
      localStorage.setItem('selectedNamespaces', JSON.stringify(newNamespaces));
    } else {
      localStorage.removeItem('selectedNamespaces');
    }
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
