import CurrenciesSection from "@/components/products/manage/CurrenciesSection"
import LocationsSection from "@/components/products/manage/LocationsSection"
import ColorsSection from "@/components/products/manage/ColorsSection"
import SizesSection from "@/components/products/manage/SizesSection"
import { MeasurementSection } from "@/components/products/manage/MeasurementSection"
import { DictionarySection } from "@/components/products/manage/DictionarySection"
import QualitiesSection from "@/components/products/manage/QualitiesSection"
import DesignsSection from "@/components/products/manage/DesignsSection"
import type { Database } from "@/types/database.types"
import { notFound } from "next/navigation"

type Tables = Database["public"]["Tables"]

export default async function ManageTablePage({
  params,
}: {
  params: Promise<{ table: string }>
}) {
  const { table } = await params

  return (
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {table === "currencies" && <CurrenciesSection />}
      {table === "locations" && <LocationsSection />}
      {table === "colors" && <ColorsSection />}
      {table === "sizes" && <SizesSection />}
      {table === "qualities" && <QualitiesSection />}
      {table === "designs" && <DesignsSection />}
      {table === "collections" && (
        <DictionarySection<Tables["collections"]["Row"]>
          table="collections"
          orderColumn="collection_name"
          title="Collections"
          entityName="Collection"
          fields={[
            { key: "collection_name", label: "Collection Name", placeholder: "e.g. Heritage", unique: true },
          ]}
          reassignConfig={{
            referencingTable: "inventory",
            referencingColumn: "collection_id",
            displayColumn: "collection_name",
          }}
        />
      )}
      {table === "fibers" && (
        <DictionarySection<Tables["fiber_list"]["Row"]>
          table="fiber_list"
          orderColumn="fiber_name"
          title="Fiber List"
          entityName="Fiber"
          fields={[
            { key: "fiber_name", label: "Fiber Name", placeholder: "e.g. Wool, Silk, Bamboo Silk", unique: true },
          ]}
        />
      )}
      {table === "constructions" && (
        <DictionarySection<Tables["constructions"]["Row"]>
          table="constructions"
          orderColumn="construction_name"
          title="Construction"
          entityName="Construction"
          fields={[
            { key: "construction_name", label: "Construction Name", placeholder: "e.g. Hand Woven", unique: true },
          ]}
          reassignConfig={{
            referencingTable: "inventory",
            referencingColumn: "construction_id",
            displayColumn: "construction_name",
          }}
        />
      )}
      {table === "product_types" && (
        <DictionarySection<Tables["product_types"]["Row"]>
          table="product_types"
          orderColumn="product_name"
          title="Product Types"
          entityName="Product Type"
          fields={[
            { key: "product_name", label: "Product Type Name", placeholder: "e.g. Rug, Dhurrie, Carpet", unique: true },
          ]}
          reassignConfig={{
            referencingTable: "inventory",
            referencingColumn: "product_type_id",
            displayColumn: "product_name",
          }}
        />
      )}
      {table === "lengths" && (
        <MeasurementSection<Tables["lengths"]["Row"]>
          table="lengths"
          orderColumn="length_name"
          valueColumn="length_name"
          title="Lengths"
          description="Discrete length reference measurements stored as a number + unit (e.g. 10 ft, 300 cm)."
          entityName="Length"
        />
      )}
      {table === "widths" && (
        <MeasurementSection<Tables["widths"]["Row"]>
          table="widths"
          orderColumn="width_name"
          valueColumn="width_name"
          title="Widths"
          description="Discrete width reference measurements stored as a number + unit (e.g. 8 ft, 244 cm)."
          entityName="Width"
        />
      )}
      {![
        "currencies", "locations", "colors", "sizes", "qualities", "designs",
        "collections", "fibers", "constructions", "product_types", "lengths", "widths"
      ].includes(table) && notFound()}
    </div>
  )
}
