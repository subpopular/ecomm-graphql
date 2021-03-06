import gql from "graphql-tag"
import { ApolloClient } from "apollo-client"
import { InMemoryCache, defaultDataIdFromObject } from "apollo-cache-inmemory"
import { HttpLink } from "apollo-link-http"
import { onError } from "apollo-link-error"
import { ApolloLink } from "apollo-link"
import { createPersistedQueryLink } from "apollo-link-persisted-queries"
import { setContext } from "apollo-link-context"
import { withClientState } from "apollo-link-state"

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors)
    graphQLErrors.map(({ message, locations, path }) =>
      console.log(
        `[GraphQL error]: Message: ${message}, Location: ${JSON.stringify(
          locations
        )}, Path: ${path}`
      )
    )
  if (networkError) console.log(`[Network error]: ${networkError}`)
})

const authLink = setContext((_, { headers }) => {
  return {
    headers: {
      ...headers,
      "x-cookie-payload":
        "PIPELINE_SESSION_ID=178e71bb18cf42009449321c25fb1cb6;"
    }
  }
})

const persistedQueryLink = createPersistedQueryLink({
  useGETForHashedQueries: true
})

const httpLink = new HttpLink({
  uri: "/graphql",
  useGETForQueries: true
})

const cache = new InMemoryCache({
  cacheRedirects: {
    Query: {
      // When querying products by path, we should redirect the query
      // to our local cache by extracting the product's `id` from the
      // path arg and use it to construct a normalized cache key.
      //
      // Given query args:
      //  { path: `/product/.../.../238620.uts` }
      //
      // We take the id `238620` and return the cache key `Product:238620`
      // to see if we already have the queried data in our local cache.
      getProduct: (_, args, { getCacheKey }) => {
        const pathParts = args.path.split("/")
        const id = pathParts[pathParts.length - 1].replace(".uts", "")
        return getCacheKey({ __typename: "Product", id })
      }
    }
  },
  dataIdFromObject: object => {
    return defaultDataIdFromObject(object)
  }
})

const stateLink = withClientState({
  cache,
  resolvers: {
    Mutation: {
      setProductDeliveryMethod: (_, args, { cache, getCacheKey }) => {
        const id = getCacheKey({ __typename: "Product", id: args.id })
        const fragment = gql`
          fragment productDeliveryMethod on Product {
            deliveryMethod
          }
        `
        const product = cache.readFragment({
          fragment,
          id
        })
        const data = { ...product, deliveryMethod: args.deliveryMethod }
        cache.writeData({ id, data })
        return null
      }
    }
  }
})

export default () =>
  new ApolloClient({
    link: ApolloLink.from([
      errorLink,
      stateLink,
      authLink,
      persistedQueryLink,
      httpLink
    ]),
    cache
  })
