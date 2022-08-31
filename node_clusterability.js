
import fs from 'fs';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import louvain from 'graphology-communities-louvain';
import {density} from 'graphology-metrics/graph/density.js';

const args = process.argv.slice(2);
const filename = args[0];
const NB_clusterings = (args.length <= 2 ? 200 : parseInt(args[1]));
const NB_FA2_ITERATIONS = (args.length <= 3 ? 100 : parseInt(args[2]));

const mean = (values) => {
  return (values.reduce((sum, current) => sum + current)) / values.length;
};

const variance = (values, average) => {
  if (average == undefined)
    average = mean(values);
  const squareDiffs = values.map((value) => {
    const diff = value - average;
    return diff * diff;
  });
  return mean(squareDiffs);
};

const std_deviation = (values, values_variance) => {
  if (values_variance == undefined)
    values_variance = variance(values);
  return Math.sqrt(values_variance);
};

const data = JSON.parse(fs.readFileSync(args[0]));
const graph = new Graph({multi: true});
graph.import(data);

// Displaying graph's stats
console.log('Number of nodes:', graph.order);
console.log('Number of edges:', graph.size);
console.log('Graph density:', density(graph));

let time0 = Date.now();
// Préspatialize graph
forceAtlas2.assign(graph, {
  iterations: NB_FA2_ITERATIONS,
  settings: forceAtlas2.inferSettings(graph)
});
let time1 = Date.now();
console.log('ForceAtlas2 processed (' + NB_FA2_ITERATIONS + ' iterations) in:', (time1 - time0)/1000 + "s");
time0 = time1;

// Computing Louvain communities
for (let i = 0; i < NB_clusterings ; i++) {
  const louv_attr = "louvain_" + i;
  louvain.assign(graph, {
    nodeCommunityAttribute: louv_attr
  });
  
  graph.forEachNode((node, attrs) => {
    let proximity = 0,
      neighbors = 0,
      neighbor_communities = {};
    neighbor_communities[attrs[louv_attr]] = true;
    graph.forEachNeighbor(node, (neighbor, neighbor_attrs) => {
      neighbors++;
      if (attrs[louv_attr] == neighbor_attrs[louv_attr])
        proximity++;
      neighbor_communities[neighbor_attrs[louv_attr]] = true;
    });
    const percent_attr = "percentage_neighbors_in_same_community_" + i,
      ratio_attr = "ratio_communities_neighbors_" + i;
    const new_attrs = {};
    new_attrs[louv_attr] = String(attrs[louv_attr]);
    new_attrs[percent_attr] = neighbors != 0 ? proximity / neighbors : 1;
    new_attrs[ratio_attr] = Object.keys(neighbor_communities).length / (neighbors + 1);
    graph.mergeNodeAttributes(node, new_attrs);
  });
}
time1 = Date.now();
console.log('Louvain processed (' + NB_clusterings + ' times) in:', (time1 - time0)/1000 + "s");
time0 = time1;

const add_statistics = (node, attrs, field_prefix) => {
  const values = Object.keys(attrs)
    .filter((x) => x.indexOf(field_prefix) == 0)
    .map((x) => attrs[x]);
  let averag = mean(values),
    varian = variance(values, averag),
    stddev = std_deviation(values, varian),
    new_attrs = {};
  new_attrs[field_prefix + "mean"] = mean(values);
  new_attrs[field_prefix + "variance"] = variance(values, new_attrs[field_prefix + "mean"]);
  new_attrs[field_prefix + "std_deviation"] = std_deviation(values, new_attrs[field_prefix + "variance"]);
  graph.mergeNodeAttributes(node, new_attrs);
};

graph.forEachNode((node, attrs) => {
  add_statistics(node, attrs, "percentage_neighbors_in_same_community_");
  add_statistics(node, attrs, "ratio_communities_neighbors_");
  for (let i = 0; i < NB_clusterings ; i++) {
    graph.removeNodeAttribute(node, "percentage_neighbors_in_same_community_" + i);
    graph.removeNodeAttribute(node, "ratio_communities_neighbors_" + i);
  }
});
time1 = Date.now();
console.log('Louvain statistics processed in:', (time1 - time0)/1000 + "s");
time0 = time1;

fs.writeFileSync(args[0].replace(/\.json/, "_with_louvains.json"), JSON.stringify(graph.export()));
